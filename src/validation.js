function rupeesToPaise(value) {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Enter a positive INR amount with at most two decimal places, for example 299.50.');
  }

  const [whole, fraction = ''] = normalized.split('.');
  const paise = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(paise) || paise < 100) {
    throw new Error('Amount must be at least ₹1.00.');
  }
  return paise;
}

function requireId(value, prefix, label) {
  const id = String(value || '').trim();
  if (!id.startsWith(prefix)) throw new Error(`${label} must start with ${prefix}.`);
  return id;
}

function optionalCustomer({ name, email, contact }) {
  const customer = {};
  if (name?.trim()) customer.name = name.trim();
  if (email?.trim()) customer.email = email.trim();
  if (contact?.trim()) customer.contact = contact.trim();
  return customer;
}

module.exports = { rupeesToPaise, requireId, optionalCustomer };
