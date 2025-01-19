export function log(prefix, data, stringify = false) {
  if (!data) {
    console.log('\n', prefix, data, '\n');
    return;
  }

  const formatOutput = (obj) => (stringify ? JSON.stringify(obj, null, 2) : obj);

  if (Array.isArray(data) || data instanceof Set) {
    const dataArray = Array.from(data);
    if (dataArray.length > 7) {
      const first = formatOutput(dataArray.slice(0, 3));
      const last = formatOutput(dataArray.slice(-3));
      console.log('\n', prefix, 'size: ', dataArray.length, ', first/last 3:\n', first, '\n...\n', last, '\n');
    } else {
      console.log('\n', prefix, 'size: ', dataArray.length, ':\n', formatOutput(dataArray), '\n');
    }
  } else if (data instanceof Date) {
    console.log('\n', prefix, data.toISOString(), '\n');
  } else if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data);
    if (entries.length > 7) {
      const first = formatOutput(Object.fromEntries(entries.slice(0, 3)));
      const last = formatOutput(Object.fromEntries(entries.slice(-3)));
      console.log('\n', prefix, 'size: ', entries.length, ', first/last 3:\n', first, '\n...\n', last, '\n');
    } else {
      console.log('\n', prefix, 'size: ', entries.length, ':\n', formatOutput(Object.fromEntries(entries)), '\n');
    }
  } else {
    console.log('\n', prefix, data, '\n');
  }
}
