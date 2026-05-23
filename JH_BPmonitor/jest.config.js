module.exports = {
  preset: 'react-native',
  modulePathIgnorePatterns: ['<rootDir>/native_app'],
  testPathIgnorePatterns: ['<rootDir>/native_app'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|react-native-calendars|react-native-safe-area-context|react-native-screens)/)',
  ],
};
