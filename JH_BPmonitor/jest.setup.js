/* global jest */

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  const renderChildren = (children) =>
    typeof children === 'function' ? children({}) : children;

  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }) => React.createElement(React.Fragment, null, children),
      Screen: ({ children }) => React.createElement(React.Fragment, null, renderChildren(children)),
    }),
  };
});

jest.mock('react-native-calendars', () => {
  const React = require('react');
  return {
    Calendar: () => React.createElement('Calendar'),
    LocaleConfig: { locales: {}, defaultLocale: 'en' },
  };
});

jest.mock('react-native-chart-kit', () => {
  const React = require('react');
  return {
    LineChart: () => React.createElement('LineChart'),
  };
});

jest.mock('@react-native-firebase/auth', () => () => ({
  onAuthStateChanged: jest.fn(() => jest.fn()),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@react-native-health-connect/react-native-health-connect', () => ({}), {
  virtual: true,
});

jest.mock('react-native-health-connect', () => ({
  initialize: jest.fn(async () => true),
  requestPermission: jest.fn(async () => []),
  readRecords: jest.fn(async () => ({ records: [] })),
  getGrantedPermissions: jest.fn(async () => []),
}));

jest.mock('@react-native-ml-kit/text-recognition', () => ({
  recognize: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
}));

jest.mock('react-native-share', () => ({
  open: jest.fn(),
}));

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  writeFile: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
