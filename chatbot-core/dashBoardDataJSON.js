const dashboardData = {
  _id: "68dabdd54a2bd70013fc4bde",
  data: {
    lastCalculatedDate: "2026-01-05",
    locomotives: {
      "68efd265b447af0013eb8906": {
        id: "68efd265b447af0013eb8906",
        name: "8304 TDOT",
        muId: null,
        locoNo: "8304",
        assetStates: {
          outOfUse: false,
          nonCompliant: false,
          engineHour: 0,
          autoBlueCardInitialize: false,
        },
        outOfUseCredit: {
          credit: 0,
          outOfUseDays: 0,
          status: "",
        },
        LastInspec: {},
        DueInspec: {},
      },
      "68efd33ab447af0013eb89b1": {
        id: "68efd33ab447af0013eb89b1",
        name: "903 EMD SL-1",
        muId: null,
        locoNo: "903 ",
        assetStates: {
          outOfUse: false,
          nonCompliant: false,
          engineHour: 0,
          autoBlueCardInitialize: false,
        },
        outOfUseCredit: {
          credit: 0,
          outOfUseDays: 0,
          status: "",
        },
        LastInspec: {},
        DueInspec: {},
      },
      // ...rest of locomotives with ISODate/NumberInt converted to plain values...
    },
  },
  inspection: null,
  execution: null,
  maintenance: null,
  tag: "liteDashboardV1",
  createdAt: "2025-09-29T17:11:49.577Z",
  updatedAt: "2026-01-05T10:54:58.115Z",
  __v: 0,
};

module.exports = dashboardData;
