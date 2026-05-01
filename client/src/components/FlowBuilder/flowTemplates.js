export const autoTemplates = {
  itrootsTraining: {
    label: 'Finlec Technologies Training',
    desc: 'Course enquiry + demo follow-up',
    nodes: [
      {
        id: 'itr_start',
        type: 'startNode',
        position: { x: 420, y: 40 },
        data: {
          label: 'Course enquiry from website / WhatsApp',
          triggerType: 'all',
          triggerValue: '',
        },
      },
      {
        id: 'itr_welcome',
        type: 'messageNode',
        position: { x: 420, y: 210 },
        data: {
          messageType: 'text',
          text: '*Hello {{name}}!* 😊\n\nWelcome to *Finlec Technologies Training*.\n\nWhich course area are you interested in?',
          buttons: [
            { title: 'Full Stack', payload: '' },
            { title: 'Data/AI', payload: '' },
            { title: 'More Options', payload: '' },
          ],
        },
      },
      {
        id: 'itr_fullstack_check',
        type: 'conditionNode',
        position: { x: 420, y: 460 },
        data: { value: 'full stack, java, dot net, dotnet', matchType: 'contains' },
      },
      {
        id: 'itr_fullstack_info',
        type: 'messageNode',
        position: { x: 40, y: 690 },
        data: {
          messageType: 'text',
          text: '*Full Stack Programs*\n\nChoose your course:',
          buttons: [
            { title: 'Full Stack Java', payload: '' },
            { title: 'Dot Net', payload: '' },
            { title: 'Call Counsellor', payload: '' },
          ],
        },
      },
      {
        id: 'itr_data_check',
        type: 'conditionNode',
        position: { x: 420, y: 690 },
        data: { value: 'data, ai, analytics, science, python', matchType: 'contains' },
      },
      {
        id: 'itr_more_options',
        type: 'messageNode',
        position: { x: 780, y: 690 },
        data: {
          messageType: 'text',
          text: '*More Course Categories*\n\nPick one option below:',
          buttons: [
            { title: 'Cyber Security', payload: '' },
            { title: 'Testing', payload: '' },
            { title: 'Business/HR', payload: '' },
          ],
        },
      },
      {
        id: 'itr_data_info',
        type: 'messageNode',
        position: { x: 260, y: 930 },
        data: {
          messageType: 'text',
          text: '*Data & AI Programs*\n\nChoose one option:',
          buttons: [
            { title: 'Data Science AI', payload: '' },
            { title: 'Analytics Python', payload: '' },
            { title: 'More Data/AI', payload: '' },
          ],
        },
      },
      {
        id: 'itr_data_more',
        type: 'messageNode',
        position: { x: 560, y: 930 },
        data: {
          messageType: 'text',
          text: '*More Data & AI Programs*\n\nChoose one option:',
          buttons: [
            { title: 'Data Analytics', payload: '' },
            { title: 'AI Program', payload: '' },
            { title: 'Call Counsellor', payload: '' },
          ],
        },
      },
      {
        id: 'itr_cyber_check',
        type: 'conditionNode',
        position: { x: 940, y: 930 },
        data: { value: 'cyber, security', matchType: 'contains' },
      },
      {
        id: 'itr_cyber_info',
        type: 'messageNode',
        position: { x: 820, y: 1150 },
        data: {
          messageType: 'text',
          text: '*Cyber Security Program*\n\nChoose one option:',
          buttons: [
            { title: 'Cyber Security', payload: '' },
            { title: 'Call Counsellor', payload: '' },
          ],
        },
      },
      {
        id: 'itr_testing_check',
        type: 'conditionNode',
        position: { x: 1180, y: 1150 },
        data: { value: 'testing, tester, qa', matchType: 'contains' },
      },
      {
        id: 'itr_testing_info',
        type: 'messageNode',
        position: { x: 1080, y: 1370 },
        data: {
          messageType: 'text',
          text: '*Testing Program*\n\nChoose one option:',
          buttons: [
            { title: 'Software Testing', payload: '' },
            { title: 'Call Counsellor', payload: '' },
          ],
        },
      },
      {
        id: 'itr_business_check',
        type: 'conditionNode',
        position: { x: 1380, y: 1370 },
        data: { value: 'business, analyst, hr, generalist', matchType: 'contains' },
      },
      {
        id: 'itr_business_info',
        type: 'messageNode',
        position: { x: 1320, y: 1590 },
        data: {
          messageType: 'text',
          text: '*Business & HR Programs*\n\nChoose your course:',
          buttons: [
            { title: 'Business Analyst', payload: '' },
            { title: 'HR Generalist', payload: '' },
            { title: 'Call Counsellor', payload: '' },
          ],
        },
      },
      {
        id: 'itr_other_info',
        type: 'messageNode',
        position: { x: 1620, y: 1590 },
        data: {
          messageType: 'text',
          text: '*Connect With Finlec Technologies*\n\nChoose an option below:',
          buttons: [
            { title: 'Call Counsellor', payload: '' },
            { title: 'View Courses', payload: '' },
          ],
        },
      },
      {
        id: 'itr_capture',
        type: 'messageNode',
        position: { x: 760, y: 1810 },
        data: {
          messageType: 'text',
          text: '*Almost done!* Please send these details in one message:\n\n*Name:*\n*Selected course:*\n*Learning mode:* Online / Classroom\n*Preferred demo time:*',
          buttons: [
            { title: 'Online', payload: '' },
            { title: 'Classroom', payload: '' },
          ],
        },
      },
      {
        id: 'itr_confirm',
        type: 'messageNode',
        position: { x: 760, y: 1990 },
        data: {
          messageType: 'text',
          text: '*Thanks for your interest in Finlec Technologies!* 🎉\n\nOur counselor will contact you soon with syllabus, fees, and batch timings.\n\nNeed immediate help?',
          buttons: [
            { title: 'Call Counsellor', payload: '' },
            { title: 'View Courses', payload: '' },
          ],
        },
      },
      {
        id: 'itr_end',
        type: 'endNode',
        position: { x: 420, y: 2170 },
        data: { label: 'Training enquiry captured', action: 'tag', tagName: 'finlec-training-lead' },
      },
    ],
    edges: [
      { id: 'itr_e1', source: 'itr_start', target: 'itr_welcome' },
      { id: 'itr_e2', source: 'itr_welcome', target: 'itr_fullstack_check' },
      { id: 'itr_e3', source: 'itr_fullstack_check', sourceHandle: 'yes', target: 'itr_fullstack_info' },
      { id: 'itr_e4', source: 'itr_fullstack_check', sourceHandle: 'no', target: 'itr_data_check' },
      { id: 'itr_e5', source: 'itr_data_check', sourceHandle: 'yes', target: 'itr_data_info' },
      { id: 'itr_e6', source: 'itr_data_check', sourceHandle: 'yes', target: 'itr_data_info' },
      { id: 'itr_e7', source: 'itr_data_check', sourceHandle: 'no', target: 'itr_more_options' },
      { id: 'itr_e8', source: 'itr_more_options', target: 'itr_cyber_check' },
      { id: 'itr_e9', source: 'itr_data_info', target: 'itr_data_more' },
      { id: 'itr_e10', source: 'itr_data_more', target: 'itr_capture' },
      { id: 'itr_e11', source: 'itr_cyber_check', sourceHandle: 'yes', target: 'itr_cyber_info' },
      { id: 'itr_e12', source: 'itr_cyber_check', sourceHandle: 'no', target: 'itr_testing_check' },
      { id: 'itr_e13', source: 'itr_testing_check', sourceHandle: 'yes', target: 'itr_testing_info' },
      { id: 'itr_e14', source: 'itr_testing_check', sourceHandle: 'no', target: 'itr_business_check' },
      { id: 'itr_e15', source: 'itr_business_check', sourceHandle: 'yes', target: 'itr_business_info' },
      { id: 'itr_e16', source: 'itr_business_check', sourceHandle: 'no', target: 'itr_other_info' },
      { id: 'itr_e17', source: 'itr_fullstack_info', target: 'itr_capture' },
      { id: 'itr_e18', source: 'itr_cyber_info', target: 'itr_capture' },
      { id: 'itr_e19', source: 'itr_testing_info', target: 'itr_capture' },
      { id: 'itr_e20', source: 'itr_business_info', target: 'itr_capture' },
      { id: 'itr_e21', source: 'itr_other_info', target: 'itr_capture' },
      { id: 'itr_e22', source: 'itr_capture', target: 'itr_confirm' },
      { id: 'itr_e23', source: 'itr_confirm', target: 'itr_end' },
    ],
  },
};

function getTemplateInstanceId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createTemplateCanvasState(templateKey = 'itrootsTraining') {
  const template = autoTemplates[templateKey];
  if (!template) {
    return {
      nodes: [
        {
          id: 'start_1',
          type: 'startNode',
          position: { x: 350, y: 100 },
          data: { label: 'When user messages', triggerType: 'all' },
        },
      ],
      edges: [],
    };
  }

  const uid = getTemplateInstanceId();

  return {
    nodes: template.nodes.map((node) => ({
      ...node,
      id: `${node.id}_${uid}`,
    })),
    edges: template.edges.map((edge) => ({
      ...edge,
      id: `${edge.id}_${uid}`,
      source: `${edge.source}_${uid}`,
      target: `${edge.target}_${uid}`,
      sourceHandle: edge.sourceHandle || undefined,
    })),
  };
}
