'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'github_id', {
      type: Sequelize.TEXT,
      allowNull: true,
      unique: true
    });
    await queryInterface.addColumn('users', 'github_username', {
      type: Sequelize.TEXT,
      allowNull: true,
      unique: true
    });
    await queryInterface.addColumn('users', 'github_access_token', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn('assignments', 'github_template_url', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn('assignment_submissions', 'github_fork_url', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('assignment_submissions', 'github_latest_commit_sha', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'github_id');
    await queryInterface.removeColumn('users', 'github_username');
    await queryInterface.removeColumn('users', 'github_access_token');
    await queryInterface.removeColumn('assignments', 'github_template_url');
    await queryInterface.removeColumn('assignment_submissions', 'github_fork_url');
    await queryInterface.removeColumn('assignment_submissions', 'github_latest_commit_sha');
  }
};
