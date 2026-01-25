export const cleanObject = function (obj: any): any {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value != null && value !== ''),
  );
};

export const getArrayFromEnum = function (Values: any) {
  const values: string[] = Object.keys(Values).map((key) => Values[key]);
  return values;
};

export const groupByFunc = function (xs: any, callback: Function) {
  return xs.reduce(function (rv: any, x: any) {
    (rv[callback(x)] = rv[callback(x)] || []).push(x);
    return rv;
  }, {});
};

