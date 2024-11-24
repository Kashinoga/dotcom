<script lang="ts">
	export let show: boolean = false; // To control modal visibility
	export let title: string = ''; // Modal title
	export let content: string = ''; // Modal content

	// Close modal when background is clicked
	const close = () => {
		show = false;
	};
</script>

<div
	class="modal {show ? 'show' : ''}"
	on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' ? close() : null)}
	role="button"
	tabindex="0"
	on:click={close}
>
	<div
		class="modal-content"
		on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' ? close() : null)}
		role="button"
		tabindex="0"
		on:click|stopPropagation
	>
		<h2>{title}</h2>
		<p>{content}</p>
		<button class="close-btn" on:click={close}>Close</button>
	</div>
</div>

<style>
	.modal {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		visibility: hidden;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.modal.show {
		visibility: visible;
		opacity: 1;
	}

	.modal-content {
		background: white;
		padding: 20px;
		border-radius: 8px;
		width: 400px;
	}

	.close-btn {
		background: red;
		color: white;
		border: none;
		padding: 5px 10px;
		cursor: pointer;
		border-radius: 5px;
	}
</style>
