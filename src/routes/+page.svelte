<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>모던 퀸즐 연구실</title>
</svelte:head>

<div class="page-shell">
	<section
		class="glass-panel"
		style="display:grid; gap:24px; padding:32px; grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.9fr);"
	>
		<div style="display:grid; gap:18px;">
			<span class="eyebrow">연구 빌드</span>
			<h1 style="margin:0; font-size:clamp(2.5rem, 5vw, 4.75rem); line-height:0.95;">모던 퀸즐</h1>
			<p style="margin:0; font-size:1.1rem; line-height:1.7; color:var(--muted); max-width:62ch;">
				고전 Queens 퍼즐의 논리적 재미는 유지하면서, 불쾌한 찍기 경험을 제거하려는 UX 가설을
				플레이어블로 검증하는 한국어 중심 연구 웹페이지입니다.
			</p>
			<div class="button-row">
				<a class="btn primary" href={resolve('/lab')}>연구실 열기</a>
				<a class="btn ghost" href={resolve('/showcase/minimal-modern')}>쇼케이스 자리보기</a>
			</div>
		</div>

		<div style="display:grid; gap:14px;">
			<div class="metric">
				<span class="eyebrow" style="width:max-content;">핵심 목표</span>
				<strong>같은 퍼즐, 다른 체감.</strong>
				<span style="color:var(--muted);"
					>같은 퍼즐 위에서 기본 모드와 모던 미니멀 규칙을 비교합니다.</span
				>
			</div>
			<div class="metric">
				<strong>DOM UI + 순수 Pixi 보드</strong>
				<span style="color:var(--muted);"
					>텍스트와 실험 패널은 DOM, 보드와 입력 히트는 Pixi가 담당합니다.</span
				>
			</div>
			<div class="metric">
				<strong>카탈로그 우선</strong>
				<span style="color:var(--muted);"
					>검증된 시드 카탈로그를 우선 사용하고, 생성기는 보조 실험 도구로 둡니다.</span
				>
			</div>
		</div>
	</section>
</div>
