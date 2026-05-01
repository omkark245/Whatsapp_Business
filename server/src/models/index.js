const sequelize = require('../config/database');
const User = require('./User');
const Team = require('./Team');
const WaAccount = require('./WaAccount');
const Contact = require('./Contact');
const Message = require('./Message');
const Template = require('./Template');
const Flow = require('./Flow');
const FlowSession = require('./FlowSession');
const ContactGroup = require('./ContactGroup');
const Campaign = require('./Campaign');
const CampaignMessage = require('./CampaignMessage');
const QuickReply = require('./QuickReply');
const ContactLabel = require('./ContactLabel');
const AutoReply = require('./AutoReply');
const DripCampaign = require('./DripCampaign');
const DripCampaignEnrollment = require('./DripCampaignEnrollment');

// Associations
User.hasMany(Team, { foreignKey: 'owner_user_id', as: 'ownedTeams' });
Team.belongsTo(User, { foreignKey: 'owner_user_id', as: 'owner' });

Team.hasMany(User, { foreignKey: 'team_id', as: 'members' });
User.belongsTo(Team, { foreignKey: 'team_id', as: 'team' });

User.hasMany(WaAccount, { foreignKey: 'user_id', as: 'waAccounts' });
WaAccount.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

WaAccount.hasMany(Contact, { foreignKey: 'wa_account_id', as: 'contacts' });
Contact.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });
Contact.belongsTo(Team, { foreignKey: 'team_id', as: 'team' });
Team.hasMany(Contact, { foreignKey: 'team_id', as: 'contacts' });
Contact.belongsTo(User, { foreignKey: 'assigned_user_id', as: 'assignedUser' });
User.hasMany(Contact, { foreignKey: 'assigned_user_id', as: 'assignedContacts' });
Contact.belongsTo(User, { foreignKey: 'assigned_by_user_id', as: 'assignedByUser' });
User.hasMany(Contact, { foreignKey: 'assigned_by_user_id', as: 'assignedContactsByUser' });

Contact.hasMany(Message, { foreignKey: 'contact_id', as: 'messages' });
Message.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

WaAccount.hasMany(Message, { foreignKey: 'wa_account_id', as: 'messages' });
Message.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });

WaAccount.hasMany(Template, { foreignKey: 'wa_account_id', as: 'templates' });
Template.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });

WaAccount.hasMany(Flow, { foreignKey: 'wa_account_id', as: 'flows' });
Flow.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });

Flow.hasMany(FlowSession, { foreignKey: 'flow_id', as: 'sessions' });
FlowSession.belongsTo(Flow, { foreignKey: 'flow_id', as: 'flow' });

Contact.hasMany(FlowSession, { foreignKey: 'contact_id', as: 'flowSessions' });
FlowSession.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

WaAccount.hasMany(ContactGroup, { foreignKey: 'wa_account_id', as: 'contactGroups' });
ContactGroup.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });
ContactGroup.belongsTo(Team, { foreignKey: 'team_id', as: 'team' });
Team.hasMany(ContactGroup, { foreignKey: 'team_id', as: 'contactGroups' });
ContactGroup.belongsTo(User, { foreignKey: 'assigned_user_id', as: 'assignedUser' });
User.hasMany(ContactGroup, { foreignKey: 'assigned_user_id', as: 'assignedGroups' });

ContactGroup.belongsToMany(Contact, { through: 'contact_group_members', foreignKey: 'group_id', as: 'contacts' });
Contact.belongsToMany(ContactGroup, { through: 'contact_group_members', foreignKey: 'contact_id', as: 'groups' });

WaAccount.hasMany(Campaign, { foreignKey: 'wa_account_id', as: 'campaigns' });
Campaign.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });
Campaign.belongsTo(Team, { foreignKey: 'team_id', as: 'team' });
Team.hasMany(Campaign, { foreignKey: 'team_id', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdByUser' });
User.hasMany(Campaign, { foreignKey: 'created_by_user_id', as: 'createdCampaigns' });

Campaign.belongsTo(Template, { foreignKey: 'template_id', as: 'template' });
Template.hasMany(Campaign, { foreignKey: 'template_id', as: 'campaigns' });

Campaign.belongsTo(ContactGroup, { foreignKey: 'group_id', as: 'group' });
ContactGroup.hasMany(Campaign, { foreignKey: 'group_id', as: 'campaigns' });

Campaign.hasMany(CampaignMessage, { foreignKey: 'campaign_id', as: 'campaignMessages' });
CampaignMessage.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

Contact.hasMany(CampaignMessage, { foreignKey: 'contact_id', as: 'campaignMessages' });
CampaignMessage.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

// Quick Replies
WaAccount.hasMany(QuickReply, { foreignKey: 'wa_account_id', as: 'quickReplies' });
QuickReply.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });

// Contact Labels
WaAccount.hasMany(ContactLabel, { foreignKey: 'wa_account_id', as: 'contactLabels' });
ContactLabel.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });

ContactLabel.belongsToMany(Contact, { through: 'contact_label_assignments', foreignKey: 'label_id', as: 'contacts' });
Contact.belongsToMany(ContactLabel, { through: 'contact_label_assignments', foreignKey: 'contact_id', as: 'labels' });

// Auto Replies
WaAccount.hasMany(AutoReply, { foreignKey: 'wa_account_id', as: 'autoReplies' });
AutoReply.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });

// Drip Campaigns
WaAccount.hasMany(DripCampaign, { foreignKey: 'wa_account_id', as: 'dripCampaigns' });
DripCampaign.belongsTo(WaAccount, { foreignKey: 'wa_account_id', as: 'waAccount' });

DripCampaign.belongsTo(ContactGroup, { foreignKey: 'group_id', as: 'group' });
ContactGroup.hasMany(DripCampaign, { foreignKey: 'group_id', as: 'dripCampaigns' });

DripCampaign.hasMany(DripCampaignEnrollment, { foreignKey: 'drip_campaign_id', as: 'enrollments' });
DripCampaignEnrollment.belongsTo(DripCampaign, { foreignKey: 'drip_campaign_id', as: 'dripCampaign' });

DripCampaignEnrollment.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });
Contact.hasMany(DripCampaignEnrollment, { foreignKey: 'contact_id', as: 'dripEnrollments' });

module.exports = {
  sequelize, User, Team, WaAccount, Contact, Message, Template,
  Flow, FlowSession, ContactGroup, Campaign, CampaignMessage,
  QuickReply, ContactLabel, AutoReply, DripCampaign, DripCampaignEnrollment,
};
