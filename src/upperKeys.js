import upperFirst from 'lodash/upperFirst';

export default function upperKeys(obj) {
  const result = {};
  Object.entries(obj).forEach(([k, v]) => {
    result[upperFirst(k)] = v;
  });
  return result;
}
