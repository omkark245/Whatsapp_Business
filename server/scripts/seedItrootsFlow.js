require('dotenv').config();

const database = require('../src/config/database');
const { Flow, FlowSession, WaAccount, sequelize } = require('../src/models');
const { migrateToLatest } = require('../src/db/umzug');
const { FLOW_NAME, buildItrootsCareerCounsellingFlow } = require('../src/utils/itrootsFlowTemplate');

async function main() {
  await database.ensureDatabase();
  await sequelize.authenticate();
  await migrateToLatest();

  const account = await WaAccount.findOne({ order: [['id', 'ASC']] });
  if (!account) {
    throw new Error('No WhatsApp account found. Connect an account before seeding the flow.');
  }

  let flow = await Flow.findOne({ where: { waAccountId: account.id, name: FLOW_NAME } });
  if (!flow) {
    flow = await Flow.findOne({ where: { waAccountId: account.id, name: 'Finlec Technologies Website Course Enquiry' } });
  }

  const starter = buildItrootsCareerCounsellingFlow({ isActive: true });
  const payload = {
    waAccountId: account.id,
    ...starter,
  };

  if (flow) {
    await FlowSession.destroy({ where: { flowId: flow.id } });
    await flow.update(payload);
  } else {
    flow = await Flow.create(payload);
  }

  console.log(JSON.stringify({
    id: flow.id,
    name: flow.name,
    active: flow.isActive,
    nodes: payload.flowData.nodes.length,
    edges: payload.flowData.edges.length,
    media: starter.media,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('seedFinlecFlow failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
