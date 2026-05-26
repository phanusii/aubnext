export function normalizeSchoolContact(value?: string | null) {
  const contact = value?.trim();
  if (!contact) return null;
  if (/^https?:\/\//i.test(contact) || /^line:\/\//i.test(contact) || /^mailto:/i.test(contact) || /^tel:/i.test(contact)) {
    return contact;
  }

  const phone = contact.replace(/[^\d+]/g, "");
  if (phone && /^[+]?\d{6,15}$/.test(phone)) {
    return `tel:${phone}`;
  }

  return `https://${contact}`;
}
