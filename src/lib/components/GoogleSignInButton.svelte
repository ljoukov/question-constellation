<script lang="ts">
	let {
		href,
		onclick,
		label = 'Sign in with Google'
	}: {
		href: string;
		onclick?: (event: MouseEvent) => void;
		label?: string;
	} = $props();

	const officialGoogleG =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAABF1JREFUeAHtmX9sU1UUx7/3vf5km6vLNsYG22Rkwx8hNcMIrKsozBjBhf0BwRAjxh//ilGT+afKHxMRExWNJAYNwWiiBlimSIyZZGqMnVaJIq4DWhgbjLHSdrSlffd67tsqIYPwXsvSkuybnPdeXs5tP+/ce885fWUgdXZ21qeFtpsu3WQu5FkMbJ/KlBe6urpOsim439tWt7m8nlY4HA7kU4lEAr/2+3Cg+0DYwtR71eUty3e3r213P7TyQVgsFuRbkqGutlZeOgLHA25FAOuWLm1GoanV45EntyKPTocThaYpJpeCAtcsYK6aBcxVuSW+iRjEoW+BP/8ABgPA2REqAwyonAssagJWeMBWr0IuyhpQ9PYAH74PEY4DHDoYk3BSo2NgF/yA7xjweTewcR2waiWyUVaA4ss3gP1fAEkbLRIrmLh6pTBmpYOdHKkMnAkC27fRQ1wG2h6GWZkH/P5VsP69EMWUSDUC01QITpEjFiYkHd0TGgFNkKXpmqzhDpruFchG5gCDe4HQe0CFQ19qQqNptd1GkdkEdj+VpoZFk36Dg8C+r4BDB+leA7BtB1BUjGxkDnD4NdoAtObsHEIV4GV1UDfsBBY0Xu0noV58map8B1BVlTWcOcCxPeQd1LtFYRdIWB2wPfAORbPx+mMyEc1BxgGjtGsttL6o/+F01qofh1pxJ2ZaxgETf+s7VgJqzAZ7zfprunXsTOu7l0mT65QOGm0cIftkuqcIjme8KtYsMVYjjAOmTiFTeBh9oWqvuaZbMHLlI2VWFNM8VBw9B6yBMRkHlDkNk6awTE65wRDkLuO12FpN+S4FTqbxBHjyBExr6hmL7caHGI4gt9+FVHwASYpkjEyc/xg1Jd5pfr+9Mn3ss58K9Icmr2U5XDwXhmU4gqmiVoxzDSOc4yTV3p/PfYLTkcM3HHc6oqFveAJpNQmuaBRAgcaZALSWP4kRxYUTNEUBAhzgFnzw7/M4mxi67phQLIH2ngHEnKO4ZIsgaYnDXZ9GdSkMyzCgorpQVrsDIaq7QaHiFHfir/hFPPbLerx09F0ciQb/9w3GL2DrsZ9w33c9+Cc9hJh9HBO2i5TcI3jOw2BGpkpdbflmLIgdgX9oF86LYoyLUkRFCfYM/4iPzvTrXRfVQHBtDrRUOTRRBWGTyVDR98fTS0qxbL656mq6o36k/i0sm7cFYV6CKC/GJUEw9Jw840DphykpinicLEZpL4q0NYYNi4uwtaUSZpVVy//EwtexpfFN3O5YiMvCBk5RY8hMnawg1G4pSQKNk08a25ubsKulCdko64760aq1un02fBjdo35agyGEEmP6Lq1zluHuogZ4Su/BpvnNcFlNJL6bBZjRxnle3WZKsz87c9UsYK66JQDD8UQchaYMkwT09/X1odDk8/nkab/qbfX+MHA8sHmOw+moqKyA1WJFPiUj19vbi68PfiNfonfo9Um+6deE9rZ8X438K0xV02+B+pT8G+I/GQh/7Ve+elUAAAAASUVORK5CYII=';
</script>

<a class="google-sign-in" {href} {onclick} data-analytics-label={label}>
	<img src={officialGoogleG} alt="" width="20" height="20" />
	<span>{label}</span>
</a>

<style>
	.google-sign-in {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		box-sizing: border-box;
		min-width: 180px;
		height: 40px;
		padding: 0 12px;
		border: 1px solid #747775;
		border-radius: 4px;
		background: #fff;
		color: #1f1f1f;
		font-family: 'Google Sans', Roboto, Arial, sans-serif;
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
		text-decoration: none;
		transition:
			background 120ms ease,
			box-shadow 120ms ease;
	}

	.google-sign-in:hover {
		background: #f8faff;
		box-shadow: 0 1px 2px rgb(60 64 67 / 0.2);
	}

	.google-sign-in:focus-visible {
		outline: 3px solid rgb(66 133 244 / 0.35);
		outline-offset: 2px;
	}

	.google-sign-in img {
		flex: 0 0 20px;
		margin-right: 10px;
	}

	.google-sign-in span {
		padding-right: 2px;
	}
</style>
