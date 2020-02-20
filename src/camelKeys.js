import camelCase from 'lodash/camelCase';

export default function camelKeys(obj) {
  const result = {};
  Object.entries(obj).forEach(([k, v]) => {
    result[camelCase(k)] = v;
  });
  return result;
}
