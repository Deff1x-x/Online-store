export const ROLES = Object.freeze({
  customer: 'customer',
  storeOperator: 'store_operator',
  adminCatalog: 'admin_catalog',
  adminOperations: 'admin_operations',
  adminCustomers: 'admin_customers',
});

export const LEGACY_ROLE_MAP = Object.freeze({
  Customer: ROLES.customer,
  Store_Op: ROLES.storeOperator,
  Admin_1_Catalog: ROLES.adminCatalog,
  Admin_2_Operations: ROLES.adminOperations,
  Admin_3_Customers: ROLES.adminCustomers,
});

export const normalizeRole = (role) => {
  return LEGACY_ROLE_MAP[role] || role;
};

export const normalizeUser = (user) => {
  if (!user) {
    return user;
  }

  return {
    ...user,
    role: normalizeRole(user.role),
  };
};

export const roleMatches = (actualRole, allowedRole) => {
  return normalizeRole(actualRole) === normalizeRole(allowedRole);
};
