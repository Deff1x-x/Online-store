export const PHONE_PATTERN = /^\+7\d{10}$/;
export const OTP_PATTERN = /^\d{4}$/;

export function validatePhone(phone: string) {
  return PHONE_PATTERN.test(phone)
    ? null
    : "Введите телефон в формате +7XXXXXXXXXX.";
}

export function validateOtp(code: string) {
  return OTP_PATTERN.test(code) ? null : "Введите код из 4 цифр.";
}

export function validateName(name: string) {
  return name.trim() ? null : "Введите имя.";
}
