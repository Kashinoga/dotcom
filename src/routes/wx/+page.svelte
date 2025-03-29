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

	let selectedState = $state('Select a State');

	let weatherDataResponse;
	let featuresLength = $state(0);

	let weatherDatum = $state({
		title: '',
		NWSheadline: '',
		areaDesc: '',
		updated: ''
	});

	let weatherData = $state<{ [key: string]: string }[]>([]);

	function clearWeatherData() {
		weatherData = [];
	}

	async function getWeatherData() {
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

	function handleStateChange(event: Event) {
		const target = event.target as HTMLSelectElement | null;
		if (target) {
			selectedState = target.value;
		}
		clearWeatherData();
		getWeatherData();
	}
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<div class="title">
					<div class="title-emoji">
						<h1>🌦️</h1>
					</div>
					<div class="title-text">
						<h1>WX</h1>
						<h2>A simple weather checker.</h2>
					</div>
				</div>

				<select
					id="stateSelect"
					class="stateSelect"
					bind:value={selectedState}
					onchange={handleStateChange}
					>\
					<option disabled>Select a State</option>
					{#each statesOfAmerica as state}
						<option value={state.abbreviation}>
							{state.name}
						</option>
					{/each}
				</select>
				{#await getWeatherData()}
					<div class="paragraphs">
						<p>Loading...</p>
					</div>
				{:then}
					<div class="cardsContainer">
						{#if featuresLength > 0}
							<div class="cards">
								<div class="card">
									<div class="weatherPerson">
										"Peer into the cauldron. It's fresh as of... {weatherDatum.updated}"
									</div>
								</div>

								{#each weatherData as weatherDatum, index}
									<div class="card">
										<div class="cardInfo">
											<div class="cardName">
												<p>
													📍 {weatherDatum.areaDesc}
												</p>
											</div>

											<p>
												{weatherDatum.NWSheadline}
											</p>
										</div>
										<button
											class="cardLabel"
											onclick={() =>
												copyToClipboard(weatherDatum.areaDesc + '\n\n' + weatherDatum.NWSheadline)}
											><span>COPY</span>
										</button>
									</div>
								{/each}
							</div>
						{:else if selectedState !== 'Select a State'}
							<div class="paragraphs">
								<p>The sorceress remains silent. There are no available alerts.</p>
							</div>
						{:else}
							<div class="paragraphs">
								<p>She awaits your selection with disinterest.</p>
							</div>
						{/if}
					</div>
				{:catch error}
					<p>Error: {error.message}</p>
				{/await}
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
		margin-bottom: var(--margin);
		margin-top: var(--margin);
	}

	.weatherPerson {
		padding: var(--padding);
	}

	@media (min-width: 900px) {
		.weatherPerson {
			flex-direction: row;
			gap: var(--gap);
			align-items: center;
		}
	}
</style>
