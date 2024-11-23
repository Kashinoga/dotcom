<script lang="ts">
	import MarginNav from '$lib/Margin/MarginNav.svelte';

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

	let selectedState = $state('Select a State');

	let weatherDataResponse;
	let featuresLength = $state(0);

	let weatherDatum = $state({
		title: '',
		NWSheadline: '',
		areaDesc: '',
		updated: ''
	});

	let weatherData: { [key: string]: string }[] = $state([]);

	async function getWeatherData() {
		// weatherData = [];
		if (selectedState != 'Select a State') {
			let url = 'https://api.weather.gov/alerts/active/area/' + selectedState;
			const response = await fetch(url);
			weatherDataResponse = await response.json();
			featuresLength = weatherDataResponse.features.length;

			for (let index = 0; index < featuresLength; index++) {
				weatherDatum = {
					title: weatherDataResponse.title,
					NWSheadline: weatherDataResponse.features[index].properties.parameters.NWSheadline,
					areaDesc: weatherDataResponse.features[index].properties.areaDesc,
					updated: new Date(weatherDataResponse.updated).toLocaleString()
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
		<div class="sections">
			<div class="section section-100">
				<div class="paper">
					<h2>🌦️ WX</h2>
					<p>A simple <span class="highlight highlight-yellow">weather app</span>.</p>
				</div>
				<div class="paper">
					<p>
						The forecast is provided by your <span class="highlight highlight-yellow"
							>local sorceress</span
						>.
					</p>
					<select
						id="stateSelect"
						class="stateSelect"
						bind:value={selectedState}
						onchange={getWeatherData}
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
								<div class="weatherPerson">
									<p>
										<span class="highlight highlight-quote"
											>"Peer into the cauldron. It's fresh as of..."</span
										>
									</p>
									<p class="weatherDatumUpdated">
										<span class="highlight highlight-quote">{weatherDatum.updated}</span>
									</p>
								</div>

								{#each weatherData as weatherDatum, index}
									<div class="weatherDatum">
										<div class="weatherMessage">
											<div class="areaDesc">
												<p class="areaDescText">
													📍 {weatherDatum.areaDesc}
												</p>
											</div>
											<div class="NWSheadline">
												<p>
													{weatherDatum.NWSheadline}
												</p>
											</div>
										</div>
										<button
											class="weatherMessageCopy"
											onclick={() =>
												copyToClipboard(weatherDatum.areaDesc + '\n\n' + weatherDatum.NWSheadline)}
											><h2>📑</h2>
										</button>
									</div>
								{/each}
							{:else if selectedState !== 'Select a State'}
								<p>
									The <span class="highlight highlight-yellow">sorceress</span> remains silent. There
									are no available alerts.
								</p>
							{:else}
								<p>
									<span class="highlight highlight-yellow">She</span> awaits your selection with disinterest.
								</p>
							{/if}
						</div>
					{:catch error}
						<p>Error: {error.message}</p>
					{/await}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	h2 {
		margin: 0;
	}

	.stateSelect {
		width: 100%;
	}

	.weatherPerson {
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 900px) {
		.weatherPerson {
			flex-direction: row;
			gap: var(--gap);
			align-items: center;
		}
	}

	.weatherDatum {
		display: flex;
		border-top: var(--border-dotted);
	}

	.weatherDatum:last-of-type {
		border-bottom: var(--border-dotted);
	}

	.weatherMessage {
		flex-grow: 1;
		border-right: var(--border-dotted);
		margin-top: var(--margin);
		margin-bottom: var(--margin);
	}

	.weatherMessage:last-child {
		border-bottom: var(--border-dotted);
	}

	.areaDesc {
		font-weight: bold;
	}

	.weatherMessageCopy {
		background-color: unset;
		cursor: grab;
	}

	.NWSheadline {
		text-align: left;
	}
</style>
