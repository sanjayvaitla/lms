'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add solution file columns to intern_tasks
    const tableDesc = await queryInterface.describeTable('intern_tasks').catch(() => null);
    if (!tableDesc) {
      console.log('Table intern_tasks does not exist yet, skipping migration');
      return;
    }

    if (!tableDesc.solution_file_url) {
      await queryInterface.addColumn('intern_tasks', 'solution_file_url', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!tableDesc.solution_file_key) {
      await queryInterface.addColumn('intern_tasks', 'solution_file_key', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!tableDesc.solution_file_name) {
      await queryInterface.addColumn('intern_tasks', 'solution_file_name', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    console.log('Migration complete: intern_tasks solution columns added');
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('intern_tasks', 'solution_file_url').catch(() => {});
    await queryInterface.removeColumn('intern_tasks', 'solution_file_key').catch(() => {});
    await queryInterface.removeColumn('intern_tasks', 'solution_file_name').catch(() => {});
  },
};
