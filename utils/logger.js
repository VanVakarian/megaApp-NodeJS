export function logStats(prefix, data) {
  if (!data) {
    console.log('\n', prefix, data, '\n');
    return;
  }

  if (Array.isArray(data) || data instanceof Set) {
    const dataArray = Array.from(data);
    if (dataArray.length > 7) {
      console.log('\n', prefix, 'size: ', dataArray.length, ', first/last 3:', dataArray.slice(0, 3), '...', dataArray.slice(-3), '\n'); // prettier-ignore
    } else {
      console.log('\n', prefix, 'size: ', dataArray.length, ':', dataArray, '\n'); // prettier-ignore
    }
  } else if (data instanceof Date) {
    console.log('\n', prefix, data.toISOString(), '\n');
  } else if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data);
    if (entries.length > 7) {
      console.log('\n', prefix, 'size: ', entries.length, ', first/last 3:', entries.slice(0, 3), '...', entries.slice(-3), '\n'); // prettier-ignore
    } else {
      console.log('\n', prefix, 'size: ', entries.length, ':', entries, '\n'); // prettier-ignore
    }
  } else {
    console.log('\n', prefix, data, '\n');
  }
}
