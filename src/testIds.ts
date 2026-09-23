// testIDs kept as constants, the way many teams do. The grounding extractor
// resolves these references (testID={HOME.contributeAction}) to the literal
// values below.
export const HOME = {
  screen: 'home-screen',
  greeting: 'home-greeting',
  balanceCard: 'home-balance-card',
  balanceAmount: 'home-balance-amount',
  contributeAction: 'home-contribute-action',
  documentsAction: 'home-documents-action',
  activityAction: 'home-activity-action',
  seeAllActivity: 'home-see-all-activity-button',
  managePlans: 'home-manage-plans-button',
  avatarButton: 'home-avatar-button',
} as const;
