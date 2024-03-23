<script lang="ts">
	let statesOfAmerica = [
		{ name: 'Alabama', abbreviation: 'AL' },
		{ name: 'Alaska', abbreviation: 'AK' },
		{ name: 'Arizona', abbreviation: 'AZ' },
		{ name: 'Arkansas', abbreviation: 'AR' },
		{ name: 'California', abbreviation: 'CA' },
		{ name: 'Colorado', abbreviation: 'CO' },
		{ name: 'Connecticut', abbreviation: 'CT' },
		{ name: 'Delaware', abbreviation: 'DE' },
		{ name: 'Florida', abbreviation: 'FL' },
		{ name: 'Georgia', abbreviation: 'GA' },
		{ name: 'Hawaii', abbreviation: 'HI' },
		{ name: 'Idaho', abbreviation: 'ID' },
		{ name: 'Illinois', abbreviation: 'IL' },
		{ name: 'Indiana', abbreviation: 'IN' },
		{ name: 'Iowa', abbreviation: 'IA' },
		{ name: 'Kansas', abbreviation: 'KS' },
		{ name: 'Kentucky', abbreviation: 'KY' },
		{ name: 'Louisiana', abbreviation: 'LA' },
		{ name: 'Maine', abbreviation: 'ME' },
		{ name: 'Maryland', abbreviation: 'MD' },
		{ name: 'Massachusetts', abbreviation: 'MA' },
		{ name: 'Michigan', abbreviation: 'MI' },
		{ name: 'Minnesota', abbreviation: 'MN' },
		{ name: 'Mississippi', abbreviation: 'MS' },
		{ name: 'Missouri', abbreviation: 'MO' },
		{ name: 'Montana', abbreviation: 'MT' },
		{ name: 'Nebraska', abbreviation: 'NE' },
		{ name: 'Nevada', abbreviation: 'NV' },
		{ name: 'New Hampshire', abbreviation: 'NH' },
		{ name: 'New Jersey', abbreviation: 'NJ' },
		{ name: 'New Mexico', abbreviation: 'NM' },
		{ name: 'New York', abbreviation: 'NY' },
		{ name: 'North Carolina', abbreviation: 'NC' },
		{ name: 'North Dakota', abbreviation: 'ND' },
		{ name: 'Ohio', abbreviation: 'OH' },
		{ name: 'Oklahoma', abbreviation: 'OK' },
		{ name: 'Oregon', abbreviation: 'OR' },
		{ name: 'Pennsylvania', abbreviation: 'PA' },
		{ name: 'Rhode Island', abbreviation: 'RI' },
		{ name: 'South Carolina', abbreviation: 'SC' },
		{ name: 'South Dakota', abbreviation: 'SD' },
		{ name: 'Tennessee', abbreviation: 'TN' },
		{ name: 'Texas', abbreviation: 'TX' },
		{ name: 'Utah', abbreviation: 'UT' },
		{ name: 'Vermont', abbreviation: 'VT' },
		{ name: 'Virginia', abbreviation: 'VA' },
		{ name: 'Washington', abbreviation: 'WA' },
		{ name: 'West Virginia', abbreviation: 'WV' },
		{ name: 'Wisconsin', abbreviation: 'WI' },
		{ name: 'Wyoming', abbreviation: 'WY' }
	];

	let selectedState = 'Select a State';

	let weatherDataResponse;
	let featuresLength = 0;

	let weatherDatum = {
		title: '',
		NWSheadline: '',
		areaDesc: ''
	};

	let weatherData: { [key: string]: string }[] = [];

	async function getWeatherData() {
		weatherData = [];
		if (selectedState != 'Select a State') {
			let url = 'https://api.weather.gov/alerts/active/area/' + selectedState;
			const response = await fetch(url);
			weatherDataResponse = await response.json();
			featuresLength = weatherDataResponse.features.length;

			for (let index = 0; index < featuresLength; index++) {
				weatherDatum = {
					title: weatherDataResponse.title,
					NWSheadline: weatherDataResponse.features[index].properties.parameters.NWSheadline,
					areaDesc: weatherDataResponse.features[index].properties.areaDesc
				};
				weatherData = [...weatherData, weatherDatum];
			}
		}
	}

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch (err) {
			console.error('An error occurred while copying: ', err);
		}
	};
</script>

<div class="container">
	<div class="content">
		<h1>🌦️ WX</h1>

		<p>Data provided by your <span class="highlight">local sorceress</span><sup>[1]</sup>.</p>

		<select
			id="stateSelect"
			class="stateSelect"
			bind:value={selectedState}
			on:change={getWeatherData}
			>\
			<option disabled>Select a State</option>
			{#each statesOfAmerica as state}
				<option value={state.abbreviation}>
					{state.name}
				</option>
			{/each}
		</select>

		{#await getWeatherData()}
			<p>Loading...</p>
		{:then}
			<div class="weatherDatumContainer">
				{#if featuresLength > 0}
					{#each weatherData as weatherDatum, index}
						<div class="weatherDatum">
							<div class="areaDesc">
								<p class="areaDescText">
									📍 {weatherDatum.areaDesc}
								</p>
								<button
									class="areaDescCopyButton"
									on:click={() =>
										copyToClipboard(weatherDatum.areaDesc + '\n\n' + weatherDatum.NWSheadline)}
									><h2>📑</h2></button
								>
							</div>
							<div class="NWSheadline">
								<p>
									{weatherDatum.NWSheadline}
								</p>
							</div>
						</div>
					{/each}
				{:else if selectedState !== 'Select a State'}
					<p>No available alerts.</p>
				{:else}
					<p>Please select a State.</p>
				{/if}
			</div>
		{:catch error}
			<p>Error: {error.message}</p>
		{/await}
	</div>
	<div class="margin"><p><sub><sup>[1]</sup> The National Weather Service.</sub></p></div>
</div>

<style>
	.stateSelect {
		width: 100%;
	}

	.weatherDatumContainer {
		border-top: var(--border);
	}

	.weatherDatum {
		border-bottom: var(--border);
	}

	.areaDesc {
		display: flex;
		font-weight: bold;
	}

	.areaDescText {
		flex-grow: 1;
		padding-bottom: 0;
		margin-block-start: 0;
		margin-block-end: 0;
		padding: var(--padding);
		padding-bottom: 0;
	}

	.areaDescCopyButton {
		border-left: var(--border);
		padding-left: var(--padding);
		padding-right: var(--padding);
	}

	select {
		appearance: button;
		background-color: var(--global-background-color);
		background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='-1 -1 12 12' enable-background:'new -1 -1 12 12;' xml:space='preserve'> <path fill='%23FFFFFF' d='M9.293,0l-3.147,3.147L.5,5.707l3.646,3.646L9,12l3.147-3.147L12.707,5.707Z'>");
		background-position: center right;
		background-repeat: no-repeat;
		background-size: contain;
		border: none;
		border-left: var(--border);
		padding: var(--padding);
		margin-bottom: var(--margin);
	}
</style>
