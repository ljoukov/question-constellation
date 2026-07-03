export function formatArticleDate(date: string) {
	return new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(new Date(`${date}T00:00:00Z`));
}
