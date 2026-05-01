const PUBLIC_BASE = process.env.PUBLIC_API_BASE_URL || 'https://api.whatsapp.finlectechnologies.com';
const BUSINESS_PHONE_PLACEHOLDER = '{{business_phone}}';
const BUSINESS_WEBSITE_PLACEHOLDER = '{{business_website}}';

const FLOW_NAME = 'Finlec Technologies Website Career Counselling Flow';
const LEGACY_FLOW_NAMES = ['Finlec Technologies Website Course Enquiry'];

function node(id, type, x, y, data) {
  return { id, type, position: { x, y }, data };
}

function edge(id, source, target, sourceHandle) {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

function imageNode(id, x, y, mediaUrl, filename, text) {
  return node(id, 'messageNode', x, y, {
    messageType: 'image',
    mediaUrl,
    filename,
    mimeType: 'image/jpeg',
    text,
    buttons: [],
    listSections: [],
  });
}

function buildItrootsCareerCounsellingFlow({ isActive = false } = {}) {
  const media = {
    welcome: `${PUBLIC_BASE}/uploads/itroots-flow-welcome.jpeg`,
    dataAnalytics: `${PUBLIC_BASE}/uploads/itroots-flow-data-analytics.jpeg`,
    aws: `${PUBLIC_BASE}/uploads/itroots-flow-aws-devops.jpeg`,
    offer: `${PUBLIC_BASE}/uploads/itroots-flow-offer-sdlc.jpeg`,
  };

  const courseButtons = [
    { title: 'Fee Offers', payload: '' },
    { title: 'Admission', payload: '' },
    { title: 'Book Demo', payload: '' },
  ];
  const contactFollowUpButtons = [
    { title: 'Book Demo', payload: '' },
    { title: 'Call Counsellor', payload: '' },
    { title: 'View Website', payload: '' },
  ];

  const nodes = [
    node('start', 'startNode', 520, 40, {
      label: 'Any enquiry from website or WhatsApp',
      triggerType: 'all',
      triggerValue: '',
    }),
    node('welcome', 'messageNode', 520, 330, {
      messageType: 'image',
      mediaUrl: media.welcome,
      filename: 'itroots-flow-welcome.jpeg',
      mimeType: 'image/jpeg',
      text: '*Hello {{name}}! Welcome to Finlec Technologies*\n\nWe help students build strong IT careers with industry-ready training and dedicated placement support.\n\nWhich course are you curious about?',
      footerText: 'Finlec Technologies Training | Career Counselling',
      buttons: [
        { title: 'Choose Course', payload: '' },
        { title: 'Book Demo', payload: '' },
        { title: 'Call Counsellor', payload: '' },
      ],
      listSections: [],
    }),
    node('welcome_choose_course_check', 'conditionNode', 520, 610, {
      value: 'choose course, course, view courses',
      matchType: 'contains',
    }),
    node('welcome_book_demo_check', 'conditionNode', 860, 610, {
      value: 'book demo, demo, counselling, counseling',
      matchType: 'contains',
    }),
    node('welcome_call_check', 'conditionNode', 1180, 610, {
      value: 'call counsellor, call counselor, counsellor, counselor, call',
      matchType: 'contains',
    }),
    node('course_root_menu', 'messageNode', 520, 860, {
      messageType: 'text',
      text: '*Choose your course area*\n\nSelect one option below and I will show the right course details.',
      buttons: [
        { title: 'Data / AI', payload: '' },
        { title: 'Java / DevOps', payload: '' },
        { title: 'Need Help', payload: '' },
      ],
    }),
    node('welcome_data_ai_check', 'conditionNode', 520, 1110, {
      value: 'data / ai, data/ai, data ai, data & ai',
      matchType: 'contains',
    }),
    node('welcome_dev_check', 'conditionNode', 860, 1110, {
      value: 'java / devops, java/devops, java devops, dev / cloud, dev/cloud, dev cloud',
      matchType: 'contains',
    }),
    node('data_ai_menu', 'messageNode', 200, 1360, {
      messageType: 'text',
      text: '*Choose your Data / AI course*\n\nPick one option below and I will share the right details.',
      buttons: [
        { title: 'Data Science', payload: '' },
        { title: 'Data Analytics', payload: '' },
        { title: 'Book Demo', payload: '' },
      ],
    }),
    node('dev_cloud_menu', 'messageNode', 860, 1360, {
      messageType: 'text',
      text: '*Choose your Java / DevOps course*\n\nPick one option below and I will guide you further.',
      buttons: [
        { title: 'Full Stack JAVA', payload: '' },
        { title: 'AWS DevOps', payload: '' },
        { title: 'Cybersecurity', payload: '' },
      ],
    }),
    node('help_menu', 'messageNode', 1520, 1360, {
      messageType: 'text',
      text: '*How can we help you today?*\n\nChoose one option below.',
      buttons: [
        { title: 'Software Testing', payload: '' },
        { title: 'Fee Offers', payload: '' },
        { title: 'Admission', payload: '' },
      ],
    }),
    node('check_data_science', 'conditionNode', 200, 1610, {
      value: 'data science, data scientist, machine learning, ml',
      matchType: 'contains',
    }),
    node('data_science_info', 'messageNode', 40, 1870, {
      messageType: 'text',
      text: '*Data Science*\n\nExcellent choice! In our Data Science course, you will step into a world where data speaks: helping businesses predict outcomes, solve problems, and make smarter decisions.\n\nIt is a strong, in-demand skill valued across the current industry.\n\nWhat would you like next?',
      buttons: courseButtons,
    }),
    node('check_data_analytics', 'conditionNode', 360, 1870, {
      value: 'data analytics, analytics, analyst, dashboard, reporting',
      matchType: 'contains',
    }),
    node('data_analytics_info', 'messageNode', 300, 2130, {
      messageType: 'text',
      text: '*Data Analytics*\n\nGreat choice! Data Analytics focuses on exploring data, finding patterns, and turning them into clear insights that businesses can use every day.\n\nIt is a practical and in-demand skill to have right now.\n\nWhat would you like next?',
      buttons: courseButtons,
    }),
    imageNode('data_analytics_image', 300, 2300, media.dataAnalytics, 'itroots-flow-data-analytics.jpeg', 'Start learning Data Analytics and save 20%.'),
    node('check_full_stack', 'conditionNode', 860, 1610, {
      value: 'full stack, fullstack, java, full stack java, developer, web development',
      matchType: 'contains',
    }),
    node('full_stack_info', 'messageNode', 720, 1870, {
      messageType: 'text',
      text: "*Full Stack JAVA*\n\nWonderful decision! Full Stack Java is a complete development program where you learn to build frontend, backend, and database-backed applications.\n\nIt is a practical, job-ready skill in strong demand in today's tech industry.\n\nWhat would you like next?",
      buttons: courseButtons,
    }),
    node('check_aws', 'conditionNode', 1040, 1870, {
      value: 'aws, devops, cloud, deployment, automation',
      matchType: 'contains',
    }),
    node('aws_info', 'messageNode', 960, 2130, {
      messageType: 'text',
      text: '*AWS with DevOps*\n\nGood to know you are interested in AWS with DevOps! This hands-on program covers cloud computing, deployment, automation, and security using leading cloud platforms.\n\nIt is a job-ready skill in demand across the tech industry.\n\nWhat would you like next?',
      buttons: courseButtons,
    }),
    imageNode('aws_image', 940, 2300, media.aws, 'itroots-flow-aws-devops.jpeg', 'AWS with DevOps: enroll now and save 20%.'),
    node('check_cyber', 'conditionNode', 1280, 2130, {
      value: 'cybersecurity, cyber security, cyber, security, ethical hacking',
      matchType: 'contains',
    }),
    node('cyber_info', 'messageNode', 1260, 2390, {
      messageType: 'text',
      text: '*Cybersecurity*\n\nNice pick! In Cybersecurity, you will learn how to defend systems, detect threats, and keep data safe in a digital world.\n\nIt is a powerful and highly relevant career skill today.\n\nWhat would you like next?',
      buttons: courseButtons,
    }),
    node('check_testing', 'conditionNode', 1520, 1610, {
      value: 'software testing, testing, qa, tester, automation testing',
      matchType: 'contains',
    }),
    node('testing_info', 'messageNode', 1520, 1870, {
      messageType: 'text',
      text: "*Software Testing*\n\nGreat choice! Software Testing focuses on identifying bugs, ensuring quality, and making sure applications run smoothly before they go live.\n\nIt is a strong, practical skill in today's IT industry.\n\nWhat would you like next?",
      buttons: courseButtons,
    }),
    node('direct_fee_check', 'conditionNode', 1820, 1870, {
      value: 'fee, fees, offer, offers, cost, price, payment',
      matchType: 'contains',
    }),
    node('direct_admission_check', 'conditionNode', 1820, 2130, {
      value: 'admission, join, enroll, enrol, process, admission process',
      matchType: 'contains',
    }),
    node('direct_demo_check', 'conditionNode', 1820, 2390, {
      value: 'demo, counselling, counseling, call counsellor, call counselor, counsellor, counselor, contact',
      matchType: 'contains',
    }),
    node('fallback_help', 'messageNode', 1820, 2650, {
      messageType: 'text',
      text: '*Finlec Technologies Career Counselling*\n\nNo worries. Tell us which course or support you need.\n\nPopular options:\n- Data Science\n- Data Analytics\n- Full Stack JAVA\n- AWS with DevOps\n- Cybersecurity\n- Software Testing\n\nOr choose one option below.',
      buttons: [
        { title: 'Book Demo', payload: '' },
        { title: 'Fee Offers', payload: '' },
        { title: 'Admission', payload: '' },
      ],
    }),
    node('intent_fee_check', 'conditionNode', 960, 2410, {
      value: 'fee, fees, offer, offers, cost, price, payment',
      matchType: 'contains',
    }),
    node('fee_offer', 'messageNode', 420, 2670, {
      messageType: 'text',
      text: `*Fee Offers Request*\n\nAppreciate your interest, {{name}}.\n\nOur career counselor will reach out shortly with complete fee details and current offers. Kindly stay available to take the call.\n\nUntil then, you can check our website here:\n${BUSINESS_WEBSITE_PLACEHOLDER}`,
      buttons: contactFollowUpButtons,
    }),
    node('fee_offer_website_check', 'conditionNode', 240, 2840, {
      value: 'view website, website, site, web, website link',
      matchType: 'contains',
    }),
    node('fee_offer_website_info', 'messageNode', 40, 3010, {
      messageType: 'text',
      text: `*Finlec Technologies Website*\n\nYou can explore courses, admissions, demo options, and updates here:\n${BUSINESS_WEBSITE_PLACEHOLDER}`,
      buttons: [],
    }),
    node('fee_offer_call_check', 'conditionNode', 420, 3010, {
      value: 'call counsellor, call counselor, counsellor, counselor, call, phone',
      matchType: 'contains',
    }),
    node('fee_offer_call_info', 'messageNode', 420, 3180, {
      messageType: 'text',
      text: `*Call Counsellor*\n\nYou can connect with our career counsellor here:\n${BUSINESS_PHONE_PLACEHOLDER}\n\nPlease mention your course interest when you call.`,
      buttons: [],
    }),
    node('fee_offer_demo_check', 'conditionNode', 760, 3180, {
      value: 'book demo, demo, counselling, counseling',
      matchType: 'contains',
    }),
    imageNode('offer_image', 420, 2840, media.offer, 'itroots-flow-offer-sdlc.jpeg', 'Enroll now to avail your Finlec Technologies offer.'),
    node('intent_admission_check', 'conditionNode', 960, 2670, {
      value: 'admission, join, enroll, enrol, process, admission process',
      matchType: 'contains',
    }),
    node('admission_process', 'messageNode', 860, 2930, {
      messageType: 'text',
      text: `*Admission Process*\n\nThank you, {{name}}. Our career counselor will call you shortly and guide you through the admission process step by step.\n\nPlease keep your phone reachable.\n\nFor urgent assistance, call: ${BUSINESS_PHONE_PLACEHOLDER}\nWebsite: ${BUSINESS_WEBSITE_PLACEHOLDER}`,
      buttons: contactFollowUpButtons,
    }),
    node('admission_website_check', 'conditionNode', 860, 3190, {
      value: 'view website, website, site, web, website link',
      matchType: 'contains',
    }),
    node('admission_website_info', 'messageNode', 660, 3360, {
      messageType: 'text',
      text: `*Finlec Technologies Website*\n\nYou can review courses, batches, and admission details here:\n${BUSINESS_WEBSITE_PLACEHOLDER}`,
      buttons: [],
    }),
    node('admission_call_check', 'conditionNode', 1040, 3360, {
      value: 'call counsellor, call counselor, counsellor, counselor, call, phone',
      matchType: 'contains',
    }),
    node('admission_call_info', 'messageNode', 1040, 3530, {
      messageType: 'text',
      text: `*Call Counsellor*\n\nYou can contact our career counsellor here:\n${BUSINESS_PHONE_PLACEHOLDER}\n\nKeep your preferred course handy when you call.`,
      buttons: [],
    }),
    node('admission_demo_check', 'conditionNode', 1380, 3530, {
      value: 'book demo, demo, counselling, counseling',
      matchType: 'contains',
    }),
    node('lead_capture', 'messageNode', 1240, 2930, {
      messageType: 'text',
      text: '*Book Demo / Counselling*\n\nPlease send these details in one message:\n\nName:\nSelected course:\nLearning mode: Online / Classroom\nPreferred demo time:\nCurrent qualification / experience:',
      buttons: [
        { title: 'Online', payload: '' },
        { title: 'Classroom', payload: '' },
        { title: 'Weekend Batch', payload: '' },
      ],
    }),
    node('confirm', 'messageNode', 1240, 3170, {
      messageType: 'text',
      text: `*Thanks! Your Finlec Technologies enquiry is received.*\n\nOur counselor will call you soon with syllabus, fee offers, demo timing, batch details, and placement guidance.\n\nFor urgent assistance, call: ${BUSINESS_PHONE_PLACEHOLDER}\nWebsite: ${BUSINESS_WEBSITE_PLACEHOLDER}`,
      buttons: [
        { title: 'Call Counsellor', payload: '' },
        { title: 'View Website', payload: '' },
      ],
    }),
    node('confirm_website_check', 'conditionNode', 1240, 3410, {
      value: 'view website, website, site, web, website link',
      matchType: 'contains',
    }),
    node('confirm_website_info', 'messageNode', 1040, 3580, {
      messageType: 'text',
      text: `*Finlec Technologies Website*\n\nYou can continue exploring courses and updates here:\n${BUSINESS_WEBSITE_PLACEHOLDER}`,
      buttons: [],
    }),
    node('confirm_call_check', 'conditionNode', 1440, 3580, {
      value: 'call counsellor, call counselor, counsellor, counselor, call, phone',
      matchType: 'contains',
    }),
    node('confirm_call_info', 'messageNode', 1440, 3750, {
      messageType: 'text',
      text: `*Call Counsellor*\n\nYou can contact our career counsellor here:\n${BUSINESS_PHONE_PLACEHOLDER}`,
      buttons: [],
    }),
    node('end', 'endNode', 1240, 3920, {
      label: 'Finlec Technologies training lead captured',
      action: 'tag',
      tagName: 'finlec-training-lead',
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
    edge('e36', 'data_analytics_info', 'data_analytics_image'),
    edge('e37', 'data_analytics_image', 'intent_fee_check'),
    edge('e38', 'full_stack_info', 'intent_fee_check'),
    edge('e39', 'aws_info', 'aws_image'),
    edge('e40', 'aws_image', 'intent_fee_check'),
    edge('e41', 'cyber_info', 'intent_fee_check'),
    edge('e42', 'testing_info', 'intent_fee_check'),
    edge('e43', 'fallback_help', 'intent_fee_check'),
    edge('e44', 'intent_fee_check', 'fee_offer', 'yes'),
    edge('e45', 'intent_fee_check', 'intent_admission_check', 'no'),
    edge('e46', 'intent_admission_check', 'admission_process', 'yes'),
    edge('e47', 'intent_admission_check', 'lead_capture', 'no'),
    edge('e48', 'fee_offer', 'fee_offer_website_check'),
    edge('e49', 'fee_offer_website_check', 'fee_offer_website_info', 'yes'),
    edge('e50', 'fee_offer_website_check', 'fee_offer_call_check', 'no'),
    edge('e51', 'fee_offer_call_check', 'fee_offer_call_info', 'yes'),
    edge('e52', 'fee_offer_call_check', 'fee_offer_demo_check', 'no'),
    edge('e53', 'fee_offer_demo_check', 'lead_capture', 'yes'),
    edge('e54', 'fee_offer_demo_check', 'offer_image', 'no'),
    edge('e55', 'fee_offer_website_info', 'offer_image'),
    edge('e56', 'fee_offer_call_info', 'offer_image'),
    edge('e57', 'offer_image', 'lead_capture'),
    edge('e58', 'admission_process', 'admission_website_check'),
    edge('e59', 'admission_website_check', 'admission_website_info', 'yes'),
    edge('e60', 'admission_website_check', 'admission_call_check', 'no'),
    edge('e61', 'admission_call_check', 'admission_call_info', 'yes'),
    edge('e62', 'admission_call_check', 'admission_demo_check', 'no'),
    edge('e63', 'admission_demo_check', 'lead_capture', 'yes'),
    edge('e64', 'admission_demo_check', 'lead_capture', 'no'),
    edge('e65', 'admission_website_info', 'lead_capture'),
    edge('e66', 'admission_call_info', 'lead_capture'),
    edge('e67', 'lead_capture', 'confirm'),
    edge('e68', 'confirm', 'confirm_website_check'),
    edge('e69', 'confirm_website_check', 'confirm_website_info', 'yes'),
    edge('e70', 'confirm_website_check', 'confirm_call_check', 'no'),
    edge('e71', 'confirm_call_check', 'confirm_call_info', 'yes'),
    edge('e72', 'confirm_call_check', 'end', 'no'),
    edge('e73', 'confirm_website_info', 'end'),
    edge('e74', 'confirm_call_info', 'end'),
  ];

  return {
    name: FLOW_NAME,
    triggerType: 'all',
    triggerValue: '',
    isActive,
    flowData: { nodes, edges },
    media,
  };
}

module.exports = {
  FLOW_NAME,
  LEGACY_FLOW_NAMES,
  buildItrootsCareerCounsellingFlow,
};
