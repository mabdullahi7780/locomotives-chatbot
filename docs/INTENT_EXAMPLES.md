# INTENT_EXAMPLES.md — Exhaustive Admin Questions (101)

These questions are designed to cover the key fields in the dashboard snapshot (`dashBoardDataJSON.js`) using varied phrasing.

---

## Snapshot metadata (root / data-level)

### Field: `data.lastCalculatedDate`
1. What’s the **lastCalculatedDate** for this dashboard snapshot?
2. When was the dashboard data **last calculated**?
3. Which date does this dashboard represent (the **calculation date**)?
4. Is the snapshot calculated for **today** or an older date?

### Field: `tag`
5. What is the **tag** of this dashboard record?
6. Which **dashboard tag/version** is this snapshot using?
7. Show me the **tag string** stored for the current snapshot.

### Field: `createdAt`
8. When was this dashboard snapshot **created**?
9. What is the **createdAt** timestamp for the snapshot?
10. On what date/time did we **first generate** this dashboard record?

### Field: `updatedAt`
11. When was this dashboard snapshot **last updated**?
12. What’s the **updatedAt** time for this record?
13. Has this snapshot been updated recently? Show **updatedAt**.

---

## Locomotive identity / lookup

### Field: `Locomotive.id`
14. Open the locomotive with **asset id** `68efff48b447af0013eb9da9`.
15. Can you find the unit whose **id** equals `68efff...da9`?
16. Pull up details for the locomotive with this **assetId**.
17. Show me the record where **Locomotive.id** matches the given id.

### Field: `Locomotive.name`
18. What is the **name** of locomotive **4430**?
19. List locomotive **names** for all units.
20. Which unit has the name **“2391 GP38-2”** (or closest match)?

### Field: `Locomotive.locoNo`
21. Find the locomotive with **locoNo** `8778`.
22. Show the **locomotive number** for asset `68efff...`.
23. Search for loco number **“903”** even if it has trailing spaces.

### Field: `Locomotive.muId`
24. What is the **muId** for locomotive **4430**?
25. Which locomotives have a **null muId**?
26. List all units and their **MU head id (muId)**.

---

## Operational state: `assetStates`

### Field: `assetStates.outOfUse`
27. Is locomotive **4430** currently **out of use**?
28. List all locomotives where **outOfUse = true**.
29. Which units are **out of service** right now?
30. Show me all units that are **available** (outOfUse = false).

### Field: `assetStates.outOfUseDate`
31. When did locomotive **8778** go **out of use**?
32. Show the **outOfUseDate** for every unit that has one.
33. Do we have an **out-of-use start date** recorded for loco **8200**?

### Field: `assetStates.nonCompliant`
34. Is locomotive **2391** flagged **non-compliant**?
35. List all locomotives that are **nonCompliant**.
36. How many units are currently **non-compliant**?
37. Show only the units that are **compliant** (nonCompliant = false).

### Field: `assetStates.engineHour`
38. What are the **engine hours** for locomotive **4430**?
39. List **engineHour** for all locomotives.
40. Which locomotive has the **highest engine hours**?
41. Show engine hours for asset `68efff...` (engineHour field).

### Field: `assetStates.autoBlueCardInitialize`
42. Is **autoBlueCardInitialize** enabled for locomotive **8778**?
43. Which units have **autoBlueCardInitialize = true**?
44. Show me the blue-card auto initialize setting for **8200**.

### Field: `assetStates.dailyDue`
45. Which locomotives are **daily due**?
46. Is locomotive **4430** daily due (check **dailyDue** field)?
47. Show the **dailyDue date/time** for loco **8778**, if present.
48. List only units that have a **dailyDue timestamp** set.

---

## Out-of-use credit: `outOfUseCredit`

### Field: `outOfUseCredit.credit`
49. What is the **out-of-use credit** value for loco **4430**?
50. List **credit** for every locomotive.
51. Which unit has the **largest out-of-use credit**?

### Field: `outOfUseCredit.outOfUseDays`
52. How many **outOfUseDays** does locomotive **8778** have?
53. Show out-of-use **days count** for each locomotive.
54. Which units have more than **10 outOfUseDays**?

### Field: `outOfUseCredit.status`
55. Is out-of-use credit **Available** for locomotive **8200**?
56. List locomotives where outOfUseCredit **status = "Available"**.
57. Show the out-of-use credit **status** for all units.

---

## Last inspection: `LastInspec`

### Field: `LastInspec.date`
58. When was locomotive **4430** **last inspected**?
59. Show the **LastInspec.date** for loco **8778**.
60. List last inspection dates for all units (skip empties).
61. Which locomotives have **no last inspection date** recorded (LastInspec is `{}`)?

### Field: `LastInspec.title`
62. What was the **title** of the last inspection for **4430**?
63. Show last inspection **title** for locomotive **2391**.
64. List the last inspection **titles** across all units.

### Field: `LastInspec.testCode`
65. What was the last inspection **testCode** for loco **8778**?
66. List last inspection **test codes** for each locomotive.
67. Which units last ran the test code **“periodic92Days”**?

### Field: `LastInspec.assetId`
68. What assetId is stored inside **LastInspec** for locomotive **4430**?
69. Verify the **LastInspec.assetId** matches the locomotive’s id for **8778**.
70. Show **LastInspec.assetId** for units where LastInspec exists.

### Field: `LastInspec.user.id`
71. What is the inspector **user id** for the last inspection on **4430**?
72. List last-inspection **user ids** for all locomotives.
73. Which locomotives were last inspected by user id **“675b...”**?

### Field: `LastInspec.user.name`
74. Who **performed** the last inspection on **8778** (user name)?
75. Show the inspector **name** for loco **2391**’s last inspection.
76. List inspector **names** for all last inspections (where available).

### Field: `LastInspec.user.email`
77. What is the inspector’s **email** for the last inspection of **4430**?
78. List last-inspection **emails** for all locomotives.
79. Show the user email for the last inspection on asset `68efff...`.

### Field: `LastInspec.user.signature.md5`
80. Is there a signature **md5 hash** saved for the last inspection on **8778**?
81. Show the inspector signature **md5** for loco **2391**, if present.
82. List all signature **md5** values where signatures exist.

### Field: `LastInspec.user.signature.status`
83. What is the signature **status code** for the last inspection on **4430**?
84. List signature **status** for all locomotives (only where signature exists).
85. Which inspections have a signature status equal to **1** (or non-zero)?

### Field: `LastInspec.user.signature.imgName`
86. What is the signature **image name** for the last inspection on **8778**?
87. List signature **imgName** fields for units that have signatures.
88. Show the signature image filename for loco **2391**’s last inspection.

---

## Due inspection: `DueInspec`

### Field: `DueInspec.nextExpiryDate`
89. When is the **next inspection expiry date** for locomotive **4430**?
90. Show the due inspection **nextExpiryDate** for loco **8778**.
91. List all units sorted by **nextExpiryDate** (soonest first).
92. Which locomotives have **no due inspection** recorded (DueInspec is `{}`)?

### Field: `DueInspec.title`
93. What is the **title** of the due inspection for **4430**?
94. Show the due inspection **title** for loco **8200**.
95. List due inspection **titles** across all locomotives.

### Field: `DueInspec.testCode`
96. What is the due inspection **testCode** for locomotive **2391**?
97. List due inspection **test codes** for every unit where DueInspec exists.
98. Which locomotives are due for test code **“periodic92Days”**?

### Field: `DueInspec.assetId`
99. What assetId is stored inside **DueInspec** for loco **4430**?
100. Confirm the **DueInspec.assetId** matches the locomotive id for **8778**.
101. List **DueInspec.assetId** for all locomotives with a due inspection entry.


## Remaining fileds of dashboardData object

### Field: `_id`
102. What is the Mongo document **_id** for this dashboard snapshot?
103. Show me the snapshot’s **_id** value.
`
### Field: `__v`
104. What is the snapshot’s Mongo version field (**__v**)?
105. Show the **__v** value for this dashboard record.

### Field: `inspection`
106. What is stored under **inspection** for this snapshot?
107. Is the **inspection** section present or null in this record?

### Field: `execution`
108. What is stored under **execution** for this snapshot?
109. Is **execution** null or does it contain data?

### Field: `maintenance`
110. What is stored under **maintenance** for this snapshot?
111. Is **maintenance** null in this dashboard record?

### (Optional but useful) `data.locomotives` map coverage
112. How many locomotives are in `data.locomotives`?
113. List all locomotive **assetIds** (keys of `data.locomotives`).

---
