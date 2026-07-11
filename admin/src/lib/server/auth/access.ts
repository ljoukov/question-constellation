export const ADMIN_USER_IDS = new Set([
	'VIEeW2vzIZeVKeSxsyCa3qIe4PI2',
	'p2lHX5qlbAVR74lqy6olJUkExP22'
]);

export function isAllowedAdminUserId(userId: string): boolean {
	return ADMIN_USER_IDS.has(userId);
}
