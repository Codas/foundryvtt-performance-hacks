<script lang="ts">
import type { OverlayState } from 'src/hacks/gpuTimingDebug.ts';
import { SvelteSet } from 'svelte/reactivity';

let { state }: { state: OverlayState } = $props()

const openGroups = new SvelteSet<string>()

function toggleGroup(label: string) {
	if (openGroups.has(label)) {
		openGroups.delete(label)
	} else {
		openGroups.add(label)
	}
}
</script>

<section class="pp-gpu-timing">
	<style>
		.pp-gpu-timing table {
			border-collapse: collapse;
			width: 100%;
		}
		.pp-gpu-timing th,
		.pp-gpu-timing td {
			padding: 1px 6px;
			line-height: 1.3;
		}
		.pp-gpu-timing th {
			text-align: left;
		}
		.pp-gpu-timing .num {
			text-align: right;
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
		}
		.pp-gpu-timing .pp-child-label {
			padding-left: 1.5em;
		}
		.pp-gpu-timing .pp-group-header td:first-child {
			cursor: pointer;
			user-select: none;
		}
		.pp-gpu-timing .pp-arrow {
			font-size: 0.65em;
			display: inline-block;
			transition: transform 0.1s;
			margin-right: 0.25em;
		}
		.pp-gpu-timing .pp-arrow.pp-open {
			transform: rotate(90deg);
		}
	</style>
	<p>Rolling average across {state.rollingWindow} frames.</p>
	<table>
		<thead>
			<tr>
				<th>Target</th>
				<th class="num">GPU ms</th>
				<th class="num">CPU ms</th>
			</tr>
		</thead>
		<tbody>
			{#each state.groups as group (group.label)}
				{#if group.isSingle}
					{@const row = group.rows[0]}
					{#if row}
						<tr>
							<td>{row.label}</td>
							<td class="num">{row.gpuMs}</td>
							<td class="num">{row.cpuMs}</td>
						</tr>
					{/if}
				{:else}
					{@const isOpen = openGroups.has(group.label)}
					<tr class="pp-group-header" onclick={() => toggleGroup(group.label)}>
						<td>
							<i class="fa-solid fa-chevron-right pp-arrow" class:pp-open={isOpen}></i>
							{group.label}
						</td>
						<td class="num">{group.subtotalGpuMs}</td>
						<td class="num">{group.subtotalCpuMs}</td>
					</tr>
					{#if isOpen}
						{#each group.rows as row (row.label)}
							<tr>
								<td class="pp-child-label">{row.label}</td>
								<td class="num">{row.gpuMs}</td>
								<td class="num">{row.cpuMs}</td>
							</tr>
						{/each}
					{/if}
				{/if}
			{/each}
			<tr>
				<th>Total</th>
				<th class="num">{state.totalGpuMs}</th>
				<th class="num">{state.totalCpuMs}</th>
			</tr>
		</tbody>
	</table>
	<table>
		<tbody>
			<tr>
				<td>Tokens rendered</td>
				<td class="num">{state.tokenCount}</td>
			</tr>
			<tr>
				<td>Void mesh draw batches</td>
				<td class="num">{state.voidMeshBatchCount}</td>
			</tr>
		</tbody>
	</table>
</section>
