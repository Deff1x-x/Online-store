export const roundMoney = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError('Money value must be a finite number');
  }

  return Math.round((number + Number.EPSILON) * 100) / 100;
};
