const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

async function run() {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    logging: console.log
  });

  const MockInterview = sequelize.define('MockInterview', {
    id: { type: DataTypes.UUID, primaryKey: true },
    proctor_logs: DataTypes.JSONB
  }, { tableName: 'mock_interviews', timestamps: false });

  try {
    const i = await MockInterview.findOne();
    console.log("Success:", i ? i.id : 'none');
  } catch(e) {
    console.error("DB Error:", e);
  }
  process.exit(0);
}
run();
