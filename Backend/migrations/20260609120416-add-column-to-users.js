'use strict';

/**
 * Migration: add trainer-related columns to users table.
 * Run:   npx sequelize db:migrate
 * Undo:  npx sequelize db:migrate:undo
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('users');

    if (!tableDesc.phone) {
      await queryInterface.addColumn('users', 'phone', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!tableDesc.auth_provider) {
      await queryInterface.addColumn('users', 'auth_provider', {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'LOCAL',
      });
    }

    if (!tableDesc.google_id) {
      await queryInterface.addColumn('users', 'google_id', {
        type: Sequelize.TEXT,
        allowNull: true,
        unique: true,
      });
    }

    if (!tableDesc.is_phone_verified) {
      await queryInterface.addColumn('users', 'is_phone_verified', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'phone');
    await queryInterface.removeColumn('users', 'auth_provider');
    await queryInterface.removeColumn('users', 'google_id');
    await queryInterface.removeColumn('users', 'is_phone_verified');
  },
};
