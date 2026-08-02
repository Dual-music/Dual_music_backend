import defineAccountReport from './AccountReport.model.js';
import defineAccountWarning from './AccountWarning.model.js';
import defineAdminLog from './AdminLog.model.js';
import defineArtistConcert from './ArtistConcert.model.js';
import defineArtistFollower from './ArtistFollower.model.js';
import defineArtistLive from './ArtistLive.model.js';
import defineArtistProfile from './ArtistProfile.model.js';
import defineArtistRequest from './ArtistRequest.model.js';
import defineBlog from './Blog.model.js';
import defineCinetpayAlert from './CinetpayAlert.model.js';
import defineCinetpayCountry from './CinetpayCountry.model.js';
import defineCinetpayTransaction from './CinetpayTransaction.model.js';
import defineCommentLike from './CommentLike.model.js';
import defineComment from './Comment.model.js';
import defineCompetitionAd from './CompetitionAd.model.js';
import defineCompetitionBan from './CompetitionBan.model.js';
import defineCompetitionCandidate from './CompetitionCandidate.model.js';
import defineCompetitionChatMessage from './CompetitionChatMessage.model.js';
import defineCompetitionGift from './CompetitionGift.model.js';
import defineCompetitionReport from './CompetitionReport.model.js';
import defineCompetitionTicket from './CompetitionTicket.model.js';
import defineCompetitionVote from './CompetitionVote.model.js';
import defineCompetition from './Competition.model.js';
import defineConcertChatMessage from './ConcertChatMessage.model.js';
import defineConcertDedication from './ConcertDedication.model.js';
import defineConcertReminder from './ConcertReminder.model.js';
import defineConcertTicket from './ConcertTicket.model.js';
import defineConcert from './Concert.model.js';
import defineContentShare from './ContentShare.model.js';
import defineCreditPurchase from './CreditPurchase.model.js';
import defineDuelAd from './DuelAd.model.js';
import defineDuelChatMessage from './DuelChatMessage.model.js';
import defineDuelReminder from './DuelReminder.model.js';
import defineDuelRequest from './DuelRequest.model.js';
import defineDuelTicket from './DuelTicket.model.js';
import defineDuelVote from './DuelVote.model.js';
import defineDuel from './Duel.model.js';
import defineEmailNotificationPreference from './EmailNotificationPreference.model.js';
import defineExchangeRate from './ExchangeRate.model.js';
import defineFanSubscription from './FanSubscription.model.js';
import defineGiftConversion from './GiftConversion.model.js';
import defineGiftTransaction from './GiftTransaction.model.js';
import defineLeaderboardReward from './LeaderboardReward.model.js';
import defineLeaderboardSeason from './LeaderboardSeason.model.js';
import defineLifestyleVideo from './LifestyleVideo.model.js';
import defineLiveChatMessage from './LiveChatMessage.model.js';
import defineLiveJoinRequest from './LiveJoinRequest.model.js';
import defineLiveLike from './LiveLike.model.js';
import defineLiveReport from './LiveReport.model.js';
import defineManagerProfile from './ManagerProfile.model.js';
import defineManagerRequest from './ManagerRequest.model.js';
import defineMonerooTransaction from './MonerooTransaction.model.js';
import defineNotification from './Notification.model.js';
import definePlatformSetting from './PlatformSetting.model.js';
import defineProfile from './Profile.model.js';
import definePushSubscription from './PushSubscription.model.js';
import defineReferral from './Referral.model.js';
import defineReplayAccess from './ReplayAccess.model.js';
import defineReplayLike from './ReplayLike.model.js';
import defineReplayVideo from './ReplayVideo.model.js';
import defineRevenueDistribution from './RevenueDistribution.model.js';
import defineSeasonWinner from './SeasonWinner.model.js';
import defineSponsorAdPlay from './SponsorAdPlay.model.js';
import defineSponsorAdVideo from './SponsorAdVideo.model.js';
import defineSponsorPriceTier from './SponsorPriceTier.model.js';
import defineSponsorRequest from './SponsorRequest.model.js';
import defineStreamBan from './StreamBan.model.js';
import defineStreamRecording from './StreamRecording.model.js';
import defineSubscriptionPlan from './SubscriptionPlan.model.js';
import defineUserBadge from './UserBadge.model.js';
import defineUserCurrencyPreference from './UserCurrencyPreference.model.js';
import defineUserGift from './UserGift.model.js';
import defineUserPayoutMethod from './UserPayoutMethod.model.js';
import defineUserRole from './UserRole.model.js';
import defineUserUiPreference from './UserUiPreference.model.js';
import defineUserWallet from './UserWallet.model.js';
import defineUserWithdrawalPin from './UserWithdrawalPin.model.js';
import defineVideoInteraction from './VideoInteraction.model.js';
import defineVirtualGift from './VirtualGift.model.js';
import defineWebrtcSignal from './WebrtcSignal.model.js';
import defineWithdrawalPinResetToken from './WithdrawalPinResetToken.model.js';
import defineWithdrawalRequest from './WithdrawalRequest.model.js';

/**
 * Registry of generated table models. Consumed by `src/models/index.js`, which
 * instantiates each definer against the shared Sequelize instance.
 * @type {Array<{ name: string, define: (sequelize: import('sequelize').Sequelize) => import('sequelize').ModelStatic<any> }>}
 */
export const generatedModels = [
  { name: 'AccountReport', define: defineAccountReport },
  { name: 'AccountWarning', define: defineAccountWarning },
  { name: 'AdminLog', define: defineAdminLog },
  { name: 'ArtistConcert', define: defineArtistConcert },
  { name: 'ArtistFollower', define: defineArtistFollower },
  { name: 'ArtistLive', define: defineArtistLive },
  { name: 'ArtistProfile', define: defineArtistProfile },
  { name: 'ArtistRequest', define: defineArtistRequest },
  { name: 'Blog', define: defineBlog },
  { name: 'CinetpayAlert', define: defineCinetpayAlert },
  { name: 'CinetpayCountry', define: defineCinetpayCountry },
  { name: 'CinetpayTransaction', define: defineCinetpayTransaction },
  { name: 'CommentLike', define: defineCommentLike },
  { name: 'Comment', define: defineComment },
  { name: 'CompetitionAd', define: defineCompetitionAd },
  { name: 'CompetitionBan', define: defineCompetitionBan },
  { name: 'CompetitionCandidate', define: defineCompetitionCandidate },
  { name: 'CompetitionChatMessage', define: defineCompetitionChatMessage },
  { name: 'CompetitionGift', define: defineCompetitionGift },
  { name: 'CompetitionReport', define: defineCompetitionReport },
  { name: 'CompetitionTicket', define: defineCompetitionTicket },
  { name: 'CompetitionVote', define: defineCompetitionVote },
  { name: 'Competition', define: defineCompetition },
  { name: 'ConcertChatMessage', define: defineConcertChatMessage },
  { name: 'ConcertDedication', define: defineConcertDedication },
  { name: 'ConcertReminder', define: defineConcertReminder },
  { name: 'ConcertTicket', define: defineConcertTicket },
  { name: 'Concert', define: defineConcert },
  { name: 'ContentShare', define: defineContentShare },
  { name: 'CreditPurchase', define: defineCreditPurchase },
  { name: 'DuelAd', define: defineDuelAd },
  { name: 'DuelChatMessage', define: defineDuelChatMessage },
  { name: 'DuelReminder', define: defineDuelReminder },
  { name: 'DuelRequest', define: defineDuelRequest },
  { name: 'DuelTicket', define: defineDuelTicket },
  { name: 'DuelVote', define: defineDuelVote },
  { name: 'Duel', define: defineDuel },
  { name: 'EmailNotificationPreference', define: defineEmailNotificationPreference },
  { name: 'ExchangeRate', define: defineExchangeRate },
  { name: 'FanSubscription', define: defineFanSubscription },
  { name: 'GiftConversion', define: defineGiftConversion },
  { name: 'GiftTransaction', define: defineGiftTransaction },
  { name: 'LeaderboardReward', define: defineLeaderboardReward },
  { name: 'LeaderboardSeason', define: defineLeaderboardSeason },
  { name: 'LifestyleVideo', define: defineLifestyleVideo },
  { name: 'LiveChatMessage', define: defineLiveChatMessage },
  { name: 'LiveJoinRequest', define: defineLiveJoinRequest },
  { name: 'LiveLike', define: defineLiveLike },
  { name: 'LiveReport', define: defineLiveReport },
  { name: 'ManagerProfile', define: defineManagerProfile },
  { name: 'ManagerRequest', define: defineManagerRequest },
  { name: 'MonerooTransaction', define: defineMonerooTransaction },
  { name: 'Notification', define: defineNotification },
  { name: 'PlatformSetting', define: definePlatformSetting },
  { name: 'Profile', define: defineProfile },
  { name: 'PushSubscription', define: definePushSubscription },
  { name: 'Referral', define: defineReferral },
  { name: 'ReplayAccess', define: defineReplayAccess },
  { name: 'ReplayLike', define: defineReplayLike },
  { name: 'ReplayVideo', define: defineReplayVideo },
  { name: 'RevenueDistribution', define: defineRevenueDistribution },
  { name: 'SeasonWinner', define: defineSeasonWinner },
  { name: 'SponsorAdPlay', define: defineSponsorAdPlay },
  { name: 'SponsorAdVideo', define: defineSponsorAdVideo },
  { name: 'SponsorPriceTier', define: defineSponsorPriceTier },
  { name: 'SponsorRequest', define: defineSponsorRequest },
  { name: 'StreamBan', define: defineStreamBan },
  { name: 'StreamRecording', define: defineStreamRecording },
  { name: 'SubscriptionPlan', define: defineSubscriptionPlan },
  { name: 'UserBadge', define: defineUserBadge },
  { name: 'UserCurrencyPreference', define: defineUserCurrencyPreference },
  { name: 'UserGift', define: defineUserGift },
  { name: 'UserPayoutMethod', define: defineUserPayoutMethod },
  { name: 'UserRole', define: defineUserRole },
  { name: 'UserUiPreference', define: defineUserUiPreference },
  { name: 'UserWallet', define: defineUserWallet },
  { name: 'UserWithdrawalPin', define: defineUserWithdrawalPin },
  { name: 'VideoInteraction', define: defineVideoInteraction },
  { name: 'VirtualGift', define: defineVirtualGift },
  { name: 'WebrtcSignal', define: defineWebrtcSignal },
  { name: 'WithdrawalPinResetToken', define: defineWithdrawalPinResetToken },
  { name: 'WithdrawalRequest', define: defineWithdrawalRequest },
];

export default generatedModels;
