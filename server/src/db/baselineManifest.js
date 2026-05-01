const BASELINE_MIGRATION_NAME = '20260419000000-initial-baseline.js';

const REQUIRED_SCHEMA = {
  users: ['id', 'name', 'email', 'password', 'role', 'owner_user_id', 'team_id', 'status', 'must_change_password', 'createdAt', 'updatedAt'],
  teams: ['id', 'owner_user_id', 'name', 'description', 'status', 'createdAt', 'updatedAt'],
  wa_accounts: ['id', 'user_id', 'waba_id', 'phone_number_id', 'phone_number', 'business_name', 'access_token', 'status', 'createdAt', 'updatedAt'],
  contacts: ['id', 'wa_account_id', 'wa_id', 'phone', 'name', 'profile_pic', 'last_message_at', 'team_id', 'assigned_user_id', 'assigned_by_user_id', 'createdAt', 'updatedAt'],
  messages: ['id', 'contact_id', 'wa_account_id', 'direction', 'type', 'content', 'media_url', 'media_id', 'wa_message_id', 'status', 'metadata', 'createdAt', 'updatedAt'],
  templates: ['id', 'wa_account_id', 'meta_template_id', 'name', 'language', 'category', 'header_type', 'header_content', 'body', 'footer', 'buttons', 'status', 'createdAt', 'updatedAt'],
  flows: ['id', 'wa_account_id', 'name', 'trigger_type', 'trigger_value', 'flow_data', 'is_active', 'createdAt', 'updatedAt'],
  flow_sessions: ['id', 'flow_id', 'contact_id', 'current_node', 'data', 'status', 'completed_at', 'createdAt', 'updatedAt'],
  contact_groups: ['id', 'wa_account_id', 'name', 'description', 'team_id', 'assigned_user_id', 'createdAt', 'updatedAt'],
  contact_group_members: ['group_id', 'contact_id', 'createdAt', 'updatedAt'],
  campaigns: ['id', 'wa_account_id', 'name', 'template_id', 'group_id', 'team_id', 'created_by_user_id', 'variables_mapping', 'scheduled_at', 'status', 'total_messages', 'sent_count', 'delivered_count', 'read_count', 'failed_count', 'createdAt', 'updatedAt'],
  campaign_messages: ['id', 'campaign_id', 'contact_id', 'message_id', 'status', 'error_message', 'error_code', 'failure_source', 'sent_at', 'createdAt', 'updatedAt'],
  quick_replies: ['id', 'wa_account_id', 'title', 'shortcut', 'content', 'is_active', 'createdAt', 'updatedAt'],
  contact_labels: ['id', 'wa_account_id', 'name', 'color', 'createdAt', 'updatedAt'],
  contact_label_assignments: ['label_id', 'contact_id', 'createdAt', 'updatedAt'],
  auto_replies: ['id', 'wa_account_id', 'type', 'keyword', 'match_type', 'reply_text', 'is_active', 'schedule_start', 'schedule_end', 'schedule_days', 'createdAt', 'updatedAt'],
  drip_campaigns: ['id', 'wa_account_id', 'name', 'group_id', 'steps', 'is_active', 'status', 'createdAt', 'updatedAt'],
  drip_campaign_enrollments: ['id', 'drip_campaign_id', 'contact_id', 'current_step', 'next_send_at', 'status', 'completed_at', 'createdAt', 'updatedAt'],
};

module.exports = {
  BASELINE_MIGRATION_NAME,
  REQUIRED_SCHEMA,
};
