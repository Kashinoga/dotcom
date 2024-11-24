<script>
	import { categories } from './categoryStore';
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<h2>🕸️ Web Browsers</h2>
				<p>You've got <span class="highlight highlight-blue">options</span>!</p>
				<div class="cardsContainer">
					{#each $categories as category}
						<h3>
							{category.name}
						</h3>
						<div class="cards">
							<div class="card">
								<div class="cardInfo">
									<h4 class="cardName">Microsoft Edge is managed by your organization</h4>
									<p>It's not, really.</p>
									<ol>
										<li>Go to: edge://policy and review if there are actual policies</li>
										<li>If there are none, continue</li>
										<li>Close Edge</li>
										<li>Open regedit</li>
										<li>Navigate to: HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge</li>
										<li>Delete this directory</li>
										<li>Open Edge and verify</li>
									</ol>
								</div>
							</div>
						</div>
					{/each}
					<div class="cards"></div>
				</div>
			</div>
		</div>
	</div>
</div>
