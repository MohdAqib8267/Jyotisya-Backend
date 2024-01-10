const padTime = (number: number): string => {
  if (number < 10) {
    return `0${number}`;
  }

  return `${number}`;
};

export const utcOffsetMinsToMySQLOffset = (utcOffset: number): string => {
  const sign = utcOffset > 0 ? "-" : "+"; // Negative sign for positive utc offset
  const hours = Math.abs(Math.floor(utcOffset / 60));
  const minutes = Math.abs(utcOffset % 60);
  return `${sign}${padTime(hours)}:${padTime(minutes)}`;
};

export const secondsToMMSS = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${padTime(mins)}:${padTime(secs)}`;
};
