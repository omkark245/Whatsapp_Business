const BUSINESS_PHONE_PLACEHOLDER = '{{business_phone}}';
const BUSINESS_WEBSITE_PLACEHOLDER = '{{business_website}}';

const FLOW_NAME = 'Finlec Technologies Business Enquiry Flow';
function node(id, type, x, y, data) {
  return { id, type, position: { x, y }, data };
}

function edge(id, source, target, sourceHandle) {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

function messageNode(id, x, y, text, buttons = []) {
  return node(id, 'messageNode', x, y, {
    messageType: 'text',
    text,
    buttons,
    listSections: [],
  });
}

function conditionNode(id, x, y, value) {
  return node(id, 'conditionNode', x, y, { value, matchType: 'contains' });
}

function buildFinlecBusinessEnquiryFlow({ isActive = false } = {}) {
  const serviceButtons = [
    { title: 'Pricing', payload: '' },
    { title: 'Book Demo', payload: '' },
    { title: 'Talk Expert', payload: '' },
  ];
  const contactFollowUpButtons = [
    { title: 'Book Demo', payload: '' },
    { title: 'Call Expert', payload: '' },
    { title: 'View Website', payload: '' },
  ];

  const nodes = [
    node('start', 'startNode', 520, 40, {
      label: 'Any Finlec Technologies enquiry from website or WhatsApp',
      triggerType: 'all',
      triggerValue: '',
    }),
    messageNode(
      'welcome',
      520,
      300,
      '*Hello {{name}}! Welcome to Finlec Technologies*\n\nWe help businesses use WhatsApp automation, campaigns, templates, chat workflows, and integrations from one dashboard.\n\nWhat would you like to do today?',
      [
        { title: 'View Services', payload: '' },
        { title: 'Book Demo', payload: '' },
        { title: 'Talk Expert', payload: '' },
      ]
    ),
    conditionNode('welcome_choose_course_check', 520, 560, 'view services, services, service, solution, solutions, features'),
    conditionNode('welcome_book_demo_check', 860, 560, 'book demo, demo, schedule demo, product demo'),
    conditionNode('welcome_call_check', 1180, 560, 'talk expert, call expert, call, contact, sales, support'),
    messageNode(
      'course_root_menu',
      520,
      820,
      '*Choose a Finlec solution area*\n\nSelect one option and I will share the right next step.',
      [
        { title: 'Automation', payload: '' },
        { title: 'Campaigns', payload: '' },
        { title: 'Need Help', payload: '' },
      ]
    ),
    conditionNode('welcome_data_ai_check', 520, 1080, 'automation, chatbot, bot, flow, auto reply, workflow'),
    conditionNode('welcome_dev_check', 860, 1080, 'campaigns, templates, broadcast, marketing, bulk message'),
    messageNode(
      'data_ai_menu',
      200,
      1340,
      '*Automation Services*\n\nChoose what you want to automate.',
      [
        { title: 'Chatbot Flows', payload: '' },
        { title: 'Auto Replies', payload: '' },
        { title: 'Book Demo', payload: '' },
      ]
    ),
    messageNode(
      'dev_cloud_menu',
      860,
      1340,
      '*Campaign & Template Services*\n\nChoose what you want to improve.',
      [
        { title: 'Campaign Setup', payload: '' },
        { title: 'Template Help', payload: '' },
        { title: 'Integrations', payload: '' },
      ]
    ),
    messageNode(
      'help_menu',
      1520,
      1340,
      '*How can Finlec Technologies help?*\n\nChoose one option below.',
      [
        { title: 'Pricing', payload: '' },
        { title: 'Book Demo', payload: '' },
        { title: 'Talk Expert', payload: '' },
      ]
    ),
    conditionNode('check_data_science', 200, 1600, 'chatbot flows, chatbot, flow, bot, conversation automation'),
    messageNode(
      'data_science_info',
      40,
      1860,
      '*Chatbot Flows*\n\nFinlec Technologies can help you build automated WhatsApp conversations for lead capture, support, follow-ups, and routing.\n\nWhat would you like next?',
      serviceButtons
    ),
    conditionNode('check_data_analytics', 360, 1860, 'auto replies, quick replies, greeting, away message, instant reply'),
    messageNode(
      'data_analytics_info',
      300,
      2120,
      '*Auto Replies & Quick Replies*\n\nSet up instant responses for common questions, greetings, business hours, and customer support shortcuts.\n\nWhat would you like next?',
      serviceButtons
    ),
    conditionNode('check_full_stack', 860, 1600, 'campaign setup, campaign, broadcast, bulk message, audience'),
    messageNode(
      'full_stack_info',
      720,
      1860,
      '*Campaign Setup*\n\nPlan and run WhatsApp campaigns with audience groups, templates, scheduling, and delivery tracking.\n\nWhat would you like next?',
      serviceButtons
    ),
    conditionNode('check_aws', 1040, 1860, 'template help, template, approved template, meta template'),
    messageNode(
      'aws_info',
      960,
      2120,
      '*Template Help*\n\nWe can help you prepare WhatsApp template messages for approvals, campaigns, and customer notifications.\n\nWhat would you like next?',
      serviceButtons
    ),
    conditionNode('check_cyber', 1280, 2120, 'integrations, api, crm, webhook, website, system integration'),
    messageNode(
      'cyber_info',
      1260,
      2380,
      '*Integrations*\n\nConnect WhatsApp with your website, CRM, lead forms, internal tools, or reporting workflows.\n\nWhat would you like next?',
      serviceButtons
    ),
    conditionNode('check_testing', 1520, 1600, 'pricing, price, cost, plan, package'),
    messageNode(
      'testing_info',
      1520,
      1860,
      '*Pricing & Packages*\n\nFinlec Technologies can suggest the right setup based on your message volume, automation needs, and team size.\n\nWhat would you like next?',
      serviceButtons
    ),
    conditionNode('direct_fee_check', 1820, 1860, 'pricing, price, cost, plan, package, quote'),
    conditionNode('direct_admission_check', 1820, 2120, 'setup, start, onboard, onboarding, implement'),
    conditionNode('direct_demo_check', 1820, 2380, 'demo, meeting, call, contact, talk expert'),
    messageNode(
      'fallback_help',
      1820,
      2640,
      '*Finlec Technologies Support*\n\nNo problem. Tell us what you need help with.\n\nPopular options:\n- WhatsApp automation\n- Campaigns and templates\n- CRM or website integration\n- Pricing and setup\n\nOr choose one option below.',
      [
        { title: 'Book Demo', payload: '' },
        { title: 'Pricing', payload: '' },
        { title: 'Talk Expert', payload: '' },
      ]
    ),
    conditionNode('intent_fee_check', 960, 2400, 'pricing, price, cost, plan, package, quote'),
    messageNode(
      'fee_offer',
      420,
      2660,
      `*Pricing Request*\n\nThanks, {{name}}.\n\nOur Finlec Technologies team will contact you with the right package and setup cost based on your business needs.\n\nYou can also visit our website here:\n${BUSINESS_WEBSITE_PLACEHOLDER}`,
      contactFollowUpButtons
    ),
    conditionNode('fee_offer_website_check', 240, 2840, 'view website, website, site, web, website link'),
    messageNode(
      'fee_offer_website_info',
      40,
      3020,
      `*Finlec Technologies Website*\n\nYou can explore services, demo options, and business solutions here:\n${BUSINESS_WEBSITE_PLACEHOLDER}`
    ),
    conditionNode('fee_offer_call_check', 420, 3020, 'call expert, talk expert, call, phone, contact'),
    messageNode(
      'fee_offer_call_info',
      420,
      3200,
      `*Call Finlec Technologies*\n\nYou can connect with our team here:\n${BUSINESS_PHONE_PLACEHOLDER}\n\nPlease mention your automation or campaign requirement when you call.`
    ),
    conditionNode('fee_offer_demo_check', 760, 3200, 'book demo, demo, meeting'),
    conditionNode('intent_admission_check', 960, 2660, 'setup, start, onboard, onboarding, implement'),
    messageNode(
      'admission_process',
      860,
      2920,
      `*Setup Process*\n\nThank you, {{name}}. Our team will call you and guide you through WhatsApp setup, templates, campaigns, and automation step by step.\n\nFor urgent help, call: ${BUSINESS_PHONE_PLACEHOLDER}\nWebsite: ${BUSINESS_WEBSITE_PLACEHOLDER}`,
      contactFollowUpButtons
    ),
    conditionNode('admission_website_check', 860, 3180, 'view website, website, site, web, website link'),
    messageNode(
      'admission_website_info',
      660,
      3360,
      `*Finlec Technologies Website*\n\nYou can review our WhatsApp business solutions here:\n${BUSINESS_WEBSITE_PLACEHOLDER}`
    ),
    conditionNode('admission_call_check', 1040, 3360, 'call expert, talk expert, call, phone, contact'),
    messageNode(
      'admission_call_info',
      1040,
      3540,
      `*Call Finlec Technologies*\n\nYou can contact our team here:\n${BUSINESS_PHONE_PLACEHOLDER}\n\nKeep your business requirement handy when you call.`
    ),
    conditionNode('admission_demo_check', 1380, 3540, 'book demo, demo, meeting'),
    messageNode(
      'lead_capture',
      1240,
      2920,
      '*Book Demo / Consultation*\n\nPlease send these details in one message:\n\nName:\nCompany name:\nRequirement: Automation / Campaigns / Templates / Integration\nPreferred demo time:\nApprox monthly message volume:',
      [
        { title: 'Automation', payload: '' },
        { title: 'Campaigns', payload: '' },
        { title: 'Integration', payload: '' },
      ]
    ),
    messageNode(
      'confirm',
      1240,
      3180,
      `*Thanks! Your Finlec Technologies enquiry is received.*\n\nOur team will contact you soon with demo timing, setup options, pricing, and the best WhatsApp solution for your business.\n\nFor urgent assistance, call: ${BUSINESS_PHONE_PLACEHOLDER}\nWebsite: ${BUSINESS_WEBSITE_PLACEHOLDER}`,
      [
        { title: 'Call Expert', payload: '' },
        { title: 'View Website', payload: '' },
      ]
    ),
    conditionNode('confirm_website_check', 1240, 3440, 'view website, website, site, web, website link'),
    messageNode(
      'confirm_website_info',
      1040,
      3620,
      `*Finlec Technologies Website*\n\nYou can continue exploring our services here:\n${BUSINESS_WEBSITE_PLACEHOLDER}`
    ),
    conditionNode('confirm_call_check', 1440, 3620, 'call expert, talk expert, call, phone, contact'),
    messageNode(
      'confirm_call_info',
      1440,
      3800,
      `*Call Finlec Technologies*\n\nYou can contact our team here:\n${BUSINESS_PHONE_PLACEHOLDER}`
    ),
    node('end', 'endNode', 1240, 3980, {
      label: 'Finlec Technologies lead captured',
      action: 'tag',
      tagName: 'finlec-technologies-lead',
    }),
  ];

  const edges = [
    edge('e1', 'start', 'welcome'),
    edge('e2', 'welcome', 'welcome_choose_course_check'),
    edge('e3', 'welcome_choose_course_check', 'course_root_menu', 'yes'),
    edge('e4', 'welcome_choose_course_check', 'welcome_book_demo_check', 'no'),
    edge('e5', 'welcome_book_demo_check', 'lead_capture', 'yes'),
    edge('e6', 'welcome_book_demo_check', 'welcome_call_check', 'no'),
    edge('e7', 'welcome_call_check', 'lead_capture', 'yes'),
    edge('e8', 'welcome_call_check', 'check_data_science', 'no'),
    edge('e9', 'course_root_menu', 'welcome_data_ai_check'),
    edge('e10', 'welcome_data_ai_check', 'data_ai_menu', 'yes'),
    edge('e11', 'welcome_data_ai_check', 'welcome_dev_check', 'no'),
    edge('e12', 'welcome_dev_check', 'dev_cloud_menu', 'yes'),
    edge('e13', 'welcome_dev_check', 'help_menu', 'no'),
    edge('e14', 'data_ai_menu', 'check_data_science'),
    edge('e15', 'dev_cloud_menu', 'check_full_stack'),
    edge('e16', 'help_menu', 'check_testing'),
    edge('e17', 'check_data_science', 'data_science_info', 'yes'),
    edge('e18', 'check_data_science', 'check_data_analytics', 'no'),
    edge('e19', 'check_data_analytics', 'data_analytics_info', 'yes'),
    edge('e20', 'check_data_analytics', 'lead_capture', 'no'),
    edge('e21', 'check_full_stack', 'full_stack_info', 'yes'),
    edge('e22', 'check_full_stack', 'check_aws', 'no'),
    edge('e23', 'check_aws', 'aws_info', 'yes'),
    edge('e24', 'check_aws', 'check_cyber', 'no'),
    edge('e25', 'check_cyber', 'cyber_info', 'yes'),
    edge('e26', 'check_cyber', 'lead_capture', 'no'),
    edge('e27', 'check_testing', 'testing_info', 'yes'),
    edge('e28', 'check_testing', 'direct_fee_check', 'no'),
    edge('e29', 'direct_fee_check', 'fee_offer', 'yes'),
    edge('e30', 'direct_fee_check', 'direct_admission_check', 'no'),
    edge('e31', 'direct_admission_check', 'admission_process', 'yes'),
    edge('e32', 'direct_admission_check', 'direct_demo_check', 'no'),
    edge('e33', 'direct_demo_check', 'lead_capture', 'yes'),
    edge('e34', 'direct_demo_check', 'fallback_help', 'no'),
    edge('e35', 'data_science_info', 'intent_fee_check'),
    edge('e36', 'data_analytics_info', 'intent_fee_check'),
    edge('e37', 'full_stack_info', 'intent_fee_check'),
    edge('e38', 'aws_info', 'intent_fee_check'),
    edge('e39', 'cyber_info', 'intent_fee_check'),
    edge('e40', 'testing_info', 'intent_fee_check'),
    edge('e41', 'fallback_help', 'intent_fee_check'),
    edge('e42', 'intent_fee_check', 'fee_offer', 'yes'),
    edge('e43', 'intent_fee_check', 'intent_admission_check', 'no'),
    edge('e44', 'intent_admission_check', 'admission_process', 'yes'),
    edge('e45', 'intent_admission_check', 'lead_capture', 'no'),
    edge('e46', 'fee_offer', 'fee_offer_website_check'),
    edge('e47', 'fee_offer_website_check', 'fee_offer_website_info', 'yes'),
    edge('e48', 'fee_offer_website_check', 'fee_offer_call_check', 'no'),
    edge('e49', 'fee_offer_call_check', 'fee_offer_call_info', 'yes'),
    edge('e50', 'fee_offer_call_check', 'fee_offer_demo_check', 'no'),
    edge('e51', 'fee_offer_demo_check', 'lead_capture', 'yes'),
    edge('e52', 'fee_offer_demo_check', 'lead_capture', 'no'),
    edge('e53', 'fee_offer_website_info', 'lead_capture'),
    edge('e54', 'fee_offer_call_info', 'lead_capture'),
    edge('e55', 'admission_process', 'admission_website_check'),
    edge('e56', 'admission_website_check', 'admission_website_info', 'yes'),
    edge('e57', 'admission_website_check', 'admission_call_check', 'no'),
    edge('e58', 'admission_call_check', 'admission_call_info', 'yes'),
    edge('e59', 'admission_call_check', 'admission_demo_check', 'no'),
    edge('e60', 'admission_demo_check', 'lead_capture', 'yes'),
    edge('e61', 'admission_demo_check', 'lead_capture', 'no'),
    edge('e62', 'admission_website_info', 'lead_capture'),
    edge('e63', 'admission_call_info', 'lead_capture'),
    edge('e64', 'lead_capture', 'confirm'),
    edge('e65', 'confirm', 'confirm_website_check'),
    edge('e66', 'confirm_website_check', 'confirm_website_info', 'yes'),
    edge('e67', 'confirm_website_check', 'confirm_call_check', 'no'),
    edge('e68', 'confirm_call_check', 'confirm_call_info', 'yes'),
    edge('e69', 'confirm_call_check', 'end', 'no'),
    edge('e70', 'confirm_website_info', 'end'),
    edge('e71', 'confirm_call_info', 'end'),
  ];

  return {
    name: FLOW_NAME,
    triggerType: 'all',
    triggerValue: '',
    isActive,
    flowData: { nodes, edges },
    media: {},
  };
}

module.exports = {
  FLOW_NAME,
  buildFinlecBusinessEnquiryFlow,
};
