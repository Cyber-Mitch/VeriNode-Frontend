/**
 * Pre-generated test account fixtures for wallet E2E tests
 * These are deterministic test keypairs generated using Stellar SDK
 * 
 * ⚠️ WARNING: These are test-only keys - NEVER use in production or with real funds
 * 
 * Generated: 2026-06-19T09:23:26.007Z
 */

export interface TestAccount {
  publicKey: string;
  secret: string;
  displayName: string;
}

/**
 * Test accounts with pre-computed Stellar keypairs
 * IMPORTANT: These are test-only keys - never use in production
 */
export const TEST_ACCOUNTS: TestAccount[] = [
  {
    displayName: 'Alice',
    publicKey: 'GD3ZBMG2A2R7JWNBVVDD4VGMFFYYI46KSEMKN5ZBJAMWE67LAVRIM6GS',
    secret: 'SA432HLFG4QPYPBNQIT7U63VQIMLJGSYNLI7HBCBIKWSQOWMK35AIZFO',
  },
  {
    displayName: 'Bob',
    publicKey: 'GAGRDGQR5H7I5HMYO5DKGGI4HYCYVNGKZXAFMSNFW2ICD67OOXCBCHDB',
    secret: 'SBH54IB7HBGT4GRSDBCAC27EU3SW7HNS7LO77MQ2XQGCEPIYWKRPXHQY',
  },
  {
    displayName: 'Charlie',
    publicKey: 'GDV2VTPJ35LYT7FQC6XPNSHVOJQIK74WVWNPLM4VC5R3OD7U473DQ7AB',
    secret: 'SABLJW2545ZS2MKOOKYEY3WYAVUU3LXRBJD3QM67LS7UJITDYCKOJYZN',
  },
  {
    displayName: 'Diana',
    publicKey: 'GBMJ7WB7I4BGDBIAGFDBU6K4OWP34YGJHSVGU2MECARMI5WN4OO3S7UB',
    secret: 'SANK752STF4POHJXVUBXT2YBCG57NPVZAHAEGF76GXITG5WVBQXKZRZJ',
  },
  {
    displayName: 'Eve',
    publicKey: 'GAZ4PNN2NRIYDQLUJEXRTQKPCLOHDRCWPJJZSTHHYDGCNHB6O727MJFS',
    secret: 'SAKTVCF4OLYABLW3YPPCWQ2AIDMTBHQBHPITEYVOY2CJ22L777PBVWQV',
  },
];

/**
 * Default test account (Alice) for single-account tests
 */
export const DEFAULT_TEST_ACCOUNT = TEST_ACCOUNTS[0];
