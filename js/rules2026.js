/*
 * 2026년 한부모가족지원사업 안내 지침 기준값
 * 연도가 바뀌면 이 파일의 수치만 새 지침에 맞춰 고치면 됩니다.
 * (괄호 안 쪽수는 지침 인쇄 쪽수)
 */
var RULES = {
  year: 2026,
  source: '2026년 한부모가족지원사업 안내 (여성가족부)',

  // 기준 중위소득 및 선정기준 (원/월, p.58)
  median: { 2: 4199292, 3: 5359036, 4: 6494738, 5: 7556719, 6: 8555952 },
  line65: { 2: 2729540, 3: 3483373, 4: 4221580, 5: 4911867, 6: 5561369 },
  line72: { 2: 3023490, 3: 3858506, 4: 4676211, 5: 5440838, 6: 6160285 },
  facilityRate: 1.0, // 한부모가족복지시설 입소: 기준 중위소득 100% 이하 (p.14)

  // 복지급여 단가 (p.171~189)
  benefit: {
    childCare: 230000,          // 아동양육비, 자녀 1인당 월
    extraChildCare: 100000,     // 추가아동양육비, 자녀 1인당 월
    schoolSupplies: 100000,     // 아동교육지원비(학용품비), 초·중·고 자녀 1인당 연 (7월 일괄)
    livingAllowance: 100000,    // 생활보조금, 시설 입소 가구당 월
    youthChildCareInfant: 400000, // 청소년한부모 아동양육비 0~1세
    youthChildCare: 370000,       // 청소년한부모 아동양육비 2세 이상
    youthSelfReliance: 100000,    // 청소년한부모 자립촉진수당, 가구당 월
    youthStudyLimit: 1540000      // 청소년한부모 검정고시 등 학습지원, 연 한도(최대 2년)
  },

  // 연령 기준 (p.42, p.49) — "해당 나이가 되는 생일이 속한 달의 전 달까지"
  age: {
    child: 18,          // 지원대상 자녀
    childStudent: 22,   // 취학 시
    childMilitaryMax: 25, // 병역의무 이행 후 취학 시 최대
    extraChild: 6,      // 추가아동양육비 5세 이하
    youthParent: 25,    // 청소년한부모 24세 이하
    youthInfant: 2,     // 청소년한부모 0~1세 영아
    youngAdultParentMax: 35, // 25~34세 청년 한부모 (35세 미만)
    youngAdultParentMin: 25,
    unmarriedExtraMin: 35    // 35세 이상 미혼 한부모 추가아동양육비
  },

  // 근로·사업소득 공제 (p.88~90) — 가장 유리한 하나 적용
  earnedDeduction: {
    basicRate: 0.30,
    young: { fixed: 600000, rate: 0.30 },   // 34세 이하, 대학생
    senior: { fixed: 200000, rate: 0.30 },  // 65세 이상, 등록장애인, 북한이탈주민, 35세 이상 초중고생
    rehab: { fixed: 200000, rate: 0.50 },   // 등록장애인 직업재활사업 참여소득
    youngMaxAgeExclusive: 35,
    seniorAge: 65
  },

  // 재산 (p.123, p.151~152)
  regions: {
    seoul:    { label: '서울특별시',            basic: 99000000, housingCap: 172000000 },
    gyeonggi: { label: '경기도',                basic: 80000000, housingCap: 151000000 },
    metro:    { label: '광역시·세종시·창원시',  basic: 77000000, housingCap: 146000000 },
    other:    { label: '그 외 지역',            basic: 53000000, housingCap: 112000000 }
  },
  conversion: { housing: 0.0104, general: 0.0417, financial: 0.0626, car100: 1.0 },
  rentDepositRatio: 0.95,       // 주택 임차보증금 적용률
  livingReserve: 5000000,       // 금융재산 생활준비금 공제 (가구당)
  interestDeductionYear: 240000, // 이자소득 공제 (연)
  privateTransferExemptRate: 0.15, // 정기 사적이전소득 중 기준중위소득 15% 이하 제외

  // 자동차 재산가액 산정 제외(p.135) · 일반재산 환산율 4.17% 적용(p.136~138) 요건
  car: {
    ccLimit: 2000,              // 장애인사용·생업용 승용, 일반재산 환산 승용: 2,000cc 미만
    disabledSevereCcLimit: 2500, // 장애 정도가 심한 장애인 본인 이동수단: 2,500cc 미만이면 일반재산
    vanMinSeats: 11,            // 생업용 승합: 11인승 이상
    disabledVanMaxSeats: 15,    // 장애인사용 일반재산 승합: 11~15인승
    multiChildCcLimit: 2500,
    multiChildSeats: 7,
    multiChildMinKids: 2,
    oldYears: 10,
    lowValue: 10000000,
    motorcycleCc: 260,
    motorcycleMax: 2,           // 260cc 이하 이륜차는 2대까지 보유 한도와 별도로 일반재산
    businessDailyWage: 82560,   // 생업용 소득 파악 곤란 시: 2026 최저임금 일급(8시간) × 월 15일
    businessDays: 15
  },

  contacts: [
    { name: '양육비이행관리원', tel: '1644-6621', web: 'www.childsupport.or.kr', desc: '양육비 상담·합의·소송·이행지원, 양육비 선지급' },
    { name: '한부모가족 무료법률구조 (대한법률구조공단)', tel: '132', desc: '양육비 청구, 친생자 관련 소송 등 무료 법률상담·소송대리' },
    { name: '가족상담전화', tel: '1577-4206', desc: '출생신고 중인 미혼부 등 가족 상담' },
    { name: '청소년전화 / 꿈드림', tel: '1388', web: 'www.kdream.or.kr', desc: '학교 밖 청소년 지원, 위기청소년 특별지원' },
    { name: '복지로', tel: '129 (보건복지상담센터)', web: 'www.bokjiro.go.kr', desc: '온라인 신청 및 복지서비스 조회' }
  ]
};

if (typeof module !== 'undefined') module.exports = RULES;
