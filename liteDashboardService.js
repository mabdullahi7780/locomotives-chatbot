import AssetsModel from "../../api/assets/assets.modal";
import ServiceLocator from "../../framework/servicelocator";
import testSchedulesModel from "../../timps/api/testSchedules/testSchedules.model";
import assetTestModel from "../../api/AssetTests/assetTests.model";
import ApplicationLookupModel from "../../api/ApplicationLookups/ApplicationLookups.model";
import momentTz from "moment-timezone";
import moment from "moment";
import { dailyInspectionFormMethods } from "../DailyInspection/dailyInspectionForms";
import OutOfUseBackground from "../OutofUse/OutOfUseBackground";
import { blueCardOOUHelpers } from "../BlueCard/Modules/blueCardOutOfUse";

class LiteDashboardService {
  constructor() {
    this.timezone = "US/Eastern";
    this.startOfDay = momentTz.tz(this.timezone).startOf("day").format();
    this.endOfDay = momentTz.tz(this.timezone).endOf("day").format();
    this.locomotives = null;
    this.testCodes = null;
  }
  async getAllLocomotives() {
    let assetService = ServiceLocator.resolve("AssetsService");
    let res = await assetService.getAllInspectableAssets();
    return res.value && res.value.assets ? res.value.assets : [];
  }

  async getAllTestCodes() {
    const locomotiveTestCodes = await assetTestModel.aggregate([
      {
        $match: {
          disabled: false,
          isRemoved: false,
        },
      },
      {
        $group: {
          _id: null,
          testCodes: { $addToSet: "$testCode" },
        },
      },

      {
        $project: {
          _id: 0,
        },
      },
    ]);

    return locomotiveTestCodes && locomotiveTestCodes[0] && locomotiveTestCodes[0].testCodes ? locomotiveTestCodes[0].testCodes : [];
  }

  async getAllLocomotivesCount() {
    let locos = await this.getAllLocomotives();
    return locos.length;
  }

  async getAllOutOfServiceLocomotivesCount() {
    let locos = await this.getAllLocomotives();
    const outOfServiceLocos = locos.filter((loco) => loco.assetStates && loco.assetStates.outOfUse);

    return outOfServiceLocos.length;
  }

  async getAllNonCompliantLocomotives() {
    let locos = await this.getAllLocomotives();
    const nonCompliantLocos = locos.filter((loco) => loco.assetStates && loco.assetStates.nonCompliant);

    return nonCompliantLocos.length;
  }

  async getAllInspectionsCompletedTodayCount() {
    const inspectionsCount = await testSchedulesModel.aggregate([
      {
        $match: {
          testCode: { $in: liteTestCodes },
          date: {
            $gte: new Date(this.startOfDay),
            $lte: new Date(this.endOfDay),
          },
          status: null,
        },
      },
      {
        $group: {
          _id: { assetId: "$assetId", testCode: "$testCode" },
          date: { $first: "$date" },
        },
      },
      {
        $count: "count",
      },
    ]);

    const count = inspectionsCount.length > 0 ? inspectionsCount[0].count : 0;

    return count;
  }

  async getAllDailyInspectionLocomotivesCount() {
    let locos = await this.getAllLocomotives();

    let dailyLocos = locos.filter((loco) => {
      const dailyDueDate = loco && loco.assetStates && loco.assetStates.dailyDue ? loco.assetStates.dailyDue : null;
      return dailyDueDate >= new Date(this.startOfDay) && dailyDueDate <= new Date(this.endOfDay);
    });

    return dailyLocos.length;
  }

  async getAllLocomotiveLastInspectionDate() {
    const testCodes = await this.getAllTestCodes();
    const locomotiveByLastInspec = await testSchedulesModel.aggregate([
      {
        $match: {
          testCode: { $in: testCodes },
          status: null,
        },
      },
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: "$assetId",
          date: { $first: "$date" },
          title: { $first: "$title" },
          testCode: { $first: "$testCode" },
          user: { $first: "$user" },
        },
      },

      {
        $project: {
          _id: 0,
          assetId: "$_id",
          date: 1,
          title: 1,
          testCode: 1,
          user: 1,
        },
      },
    ]);
    const locomotiveByLastInspecObject = {};
    locomotiveByLastInspec.forEach((record) => {
      locomotiveByLastInspecObject[record.assetId] = record;
    });

    return locomotiveByLastInspecObject;
  }

  async getAllLocomotiveDueInspectionDate() {
    const testCodes = await this.getAllTestCodes();
    const locomotiveByDueInspec = await assetTestModel.aggregate([
      {
        $match: {
          testCode: { $in: testCodes },
        },
      },
      {
        $sort: {
          nextExpiryDate: 1,
        },
      },
      {
        $group: {
          _id: "$assetId",
          nextExpiryDate: { $first: "$nextExpiryDate" },
          testCode: { $first: "$testCode" },
          title: { $first: "$title" },
        },
      },

      {
        $project: {
          _id: 0,
          assetId: "$_id",
          nextExpiryDate: 1,
          testCode: 1,
          title: 1,
        },
      },
    ]);

    const locomotiveByDueInspecObject = {};

    locomotiveByDueInspec.forEach((record) => {
      locomotiveByDueInspecObject[record.assetId] = record;
    });

    return locomotiveByDueInspecObject;
  }

  async getLocoOutOfUseCredit(assetId) {
    let oouLookUp = await ApplicationLookupModel.findOne({
      listName: "OutOfUseAsset",
      code: `OOU_${assetId}`,
    }).lean();

    if (oouLookUp && oouLookUp.opt2 && oouLookUp.opt2.length > 0) {
      const openEntry = oouLookUp.opt2 && oouLookUp.opt2.find((oou) => !oou.end);

      let creditDue = 0;
      let creditAvailable = 0;

      const availableEntry = oouLookUp.opt2.filter((oou) => oou.status === "Available");
      const areAllAvailableEntriesCertified = availableEntry.every((item) => item.certified && item.certified.certifiedBy);

      let status = areAllAvailableEntriesCertified ? "Available" : "";

      if (openEntry) {
        const startDate = moment(openEntry.start);
        const endDate = openEntry.end ? moment(openEntry.end) : moment();
        creditDue = blueCardOOUHelpers.calculateEntryCredit({ start: startDate, end: endDate });
        status = "";
      }

      if (availableEntry.length > 0) {
        creditAvailable = await OutOfUseBackground.getAvailableCredit(assetId);
      }

      const outOfUseCredit = {
        credit: creditAvailable,
        outOfUseDays: creditDue,
        status: status,
      };

      return outOfUseCredit;
    } else {
      return {
        credit: 0,
        outOfUseDays: 0,
        status: "",
      };
    }
  }

  async updateDashBoardLocoState(locoId) {
    let dashboardModel = ServiceLocator.resolve("ReportModel");
    let dashboardData = await dashboardModel.findOne({ tag: "liteDashboardV1" }).lean();
    let locos = await this.getAllLocomotives();
    const loco = locos.find((loco) => loco._id.toString() === locoId);
    if (dashboardData && dashboardData.data && dashboardData.data.locomotives && dashboardData.data.locomotives[locoId]) {
      await dashboardModel.updateOne(
        {
          tag: "liteDashboardV1",
        },
        {
          $set: {
            [`data.locomotives.${locoId}.assetStates`]: loco.assetStates,
          },
        },
      );
    }
  }

  async updateLocoOutOfUseCredit(locoId) {
    let dashboardModel = ServiceLocator.resolve("ReportModel");
    let dashboardData = await dashboardModel.findOne({ tag: "liteDashboardV1" }).lean();
    const outOfUseCredit = await this.getLocoOutOfUseCredit(locoId);
    if (dashboardData && dashboardData.data && dashboardData.data.locomotives && dashboardData.data.locomotives[locoId]) {
      await dashboardModel.updateOne(
        {
          tag: "liteDashboardV1",
        },
        {
          $set: {
            [`data.locomotives.${locoId}.outOfUseCredit`]: outOfUseCredit,
          },
        },
      );
    }
  }

  async getLocoNextDueLocoInspection(assetId) {
    let nextDueInspec = await assetTestModel
      .findOne(
        { assetId: assetId, nextExpiryDate: { $ne: null } },
        {
          assetId: 1,
          nextExpiryDate: 1,
          title: 1,
          testCode: 1,
          _id: 0,
        },
      )
      .sort({ nextExpiryDate: 1 })
      .lean();

    return nextDueInspec || {};
  }

  async updateDashBoardLocoInspection(date, unit, testInfo) {
    const assetId = unit && unit.id ? unit.id : "";
    const lastInspectionObj = {
      assetId: assetId,
      date: new Date(date),
      title: testInfo.title,
      testCode: testInfo.testCode,
      user: testInfo.user,
    };

    const nextDueInspec = await this.getLocoNextDueLocoInspection(assetId);

    let dashboardModel = ServiceLocator.resolve("ReportModel");
    let dashboardData = await dashboardModel.findOne({ tag: "liteDashboardV1" }).lean();

    if (dashboardData && dashboardData.data && dashboardData.data.locomotives && dashboardData.data.locomotives[assetId]) {
      await dashboardModel.updateOne(
        {
          tag: "liteDashboardV1",
        },
        {
          $set: {
            [`data.locomotives.${assetId}.LastInspec`]: lastInspectionObj,
            [`data.locomotives.${assetId}.DueInspec`]: nextDueInspec,
          },
        },
      );
    }
  }

  async getLocoMUId(locoId, locos) {
    let muAsset = await ApplicationLookupModel.findOne({
      listName: "MUAsset",
      code: `MU_${locoId}`,
    }).lean();

    const muId = muAsset && (muAsset.opt1 && muAsset.opt1.length > 0 ? locoId : muAsset.opt2 ? muAsset.opt2 : null);

    const headMU = locos.find((loco) => loco._id.toString() === muId);

    const locoNo = headMU && headMU.attributes ? headMU.attributes["Loco No"] : null;

    return locoNo;
  }

  async updateDashBoardLocoMUId(locoId) {
    let dashboardModel = ServiceLocator.resolve("ReportModel");
    let dashboardData = await dashboardModel.findOne({ tag: "liteDashboardV1" }).lean();
    let locos = await this.getAllLocomotives();
    let locoNo = await this.getLocoMUId(locoId, locos);

    if (dashboardData && dashboardData.data && dashboardData.data.locomotives && dashboardData.data.locomotives[locoId]) {
      await dashboardModel.updateOne(
        {
          tag: "liteDashboardV1",
        },
        {
          $set: {
            [`data.locomotives.${locoId}.muId`]: locoNo,
          },
        },
      );
    }
  }

  async getDashBoardData() {
    try {
      const noOfLocomotives = await this.getAllLocomotivesCount();
      const locomotiveDailyInspections = await this.getAllDailyInspectionLocomotivesCount();
      const locomotivesDueForDailyInspec = noOfLocomotives - locomotiveDailyInspections;
      const locomotivesOutOfService = await this.getAllOutOfServiceLocomotivesCount();
      const nonCompliantLocomotives = await this.getAllNonCompliantLocomotives();

      const summary = {
        noOfLocomotives: noOfLocomotives,
        locomotiveDailyInspections: locomotiveDailyInspections,
        locomotivesDueForDailyInspec: locomotivesDueForDailyInspec,
        locomotivesOutOfService: locomotivesOutOfService,
        nonCompliantLocomotives: nonCompliantLocomotives,
        compliantLocomotives: noOfLocomotives - nonCompliantLocomotives,
      };
      let dashboardModel = ServiceLocator.resolve("ReportModel");
      let data = await dashboardModel.findOne({ tag: "liteDashboardV1" }).exec();

      console.log("Summary is: ",summary);
      return { status: 200, value: { summary: summary, assetData: data && data.data && data.data.locomotives } };
    } catch (e) {
      return { status: 500, value: err };
    }
  }
  async dashBoardDataBuildUp() {
    try {
      let locos = await this.getAllLocomotives();

      let locosLastInspec = await this.getAllLocomotiveLastInspectionDate();
      let locosDueInspec = await this.getAllLocomotiveDueInspectionDate();

      let locoData = {};

      for (let loco of locos) {
        const locoLastInspec = locosLastInspec[loco._id.toString()] ? locosLastInspec[loco._id.toString()] : {};
        const locoDueInspec = await this.getLocoNextDueLocoInspection(loco._id.toString());
        const outOfUseCredit = await this.getLocoOutOfUseCredit(loco._id.toString());
        const muAssetLocoNo = await this.getLocoMUId(loco._id.toString(), locos);
        locoData[loco._id] = {
          id: loco._id.toString(), //assetid
          name: loco.unitId,
          muId: muAssetLocoNo,
          locoNo: loco.attributes && loco.attributes["Loco No"],
          assetStates: loco.assetStates,
          outOfUseCredit: outOfUseCredit,
          LastInspec: locoLastInspec,
          DueInspec: locoDueInspec,
        };
      }

      let dashboardModel = ServiceLocator.resolve("ReportModel");
      let data = await dashboardModel.findOne({ tag: "liteDashboardV1" }).exec();
      const TODAY_CALCULATED_DATE = moment().utc().startOf("day").format("YYYY-MM-DD");

      if (data) {
        data.data.locomotives = locoData;
        data.data.lastCalculatedDate = TODAY_CALCULATED_DATE;
        data.markModified("data");
        await data.save();
      } else {
        data = { data: {} };
        data.data.locomotives = locoData;
        data.data.lastCalculatedDate = TODAY_CALCULATED_DATE;
        data.tag = "liteDashboardV1";
        let newData = new dashboardModel(data);
        await newData.save();
      }
    } catch (e) {
      console.log("Error in liteDashBoardCalculation : ", error);
    }
  }
}

const liteTestCodes = [
  "DailyLocomotiveAppForm",
  "periodic92Days",
  "path_92DaysForm",
  "periodic184Days",
  "LocomotiveMechanicalInspectionAppForm33day",
  "periodic368Days",
  "periodicMultipleYears1",
  "periodicMultipleYears2",
  "periodicMultipleYears3",
  "eventRecordTest25d",
  "eventRecordMicroprocessorTest27c",
  "AirBrakeAFM92Days",
  "AirBrakeAFMLevelOne",
  "AirBrakeSys1Lvl2",
  "AirBrakeSys2Lvl2",
  "AirBrakeSys3Lvl2",
  "AirBrakeSys4Lvl2",
  "AirBrakeSys1Lvl3",
  "AirBrakeSys2Lvl3",
  "AirBrakeSys3Lvl3",
  "AirBrakeSys4Lvl3",
  "hydrostaticHammerTest736days",
  "handBreakTest105c",
  "waiverType",
  ...dailyInspectionFormMethods.getDailyInspectionForms(),
];

export default LiteDashboardService;
