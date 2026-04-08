import { gsap } from 'gsap';
import type { AnimationPreset, CellMark } from '$lib/core/types';
import { PIXI_THEME } from '../theme/palette';
import { CellView } from './cell-view';

interface CellRuntime {
	view: CellView;
	transition: gsap.core.Tween | gsap.core.Timeline | null;
	feedback: gsap.core.Tween | gsap.core.Timeline | null;
	charge: gsap.core.Tween | null;
}

interface TransitionOptions {
	delay?: number;
}

export class BoardEffectController {
	private runtimes = new Map<number, CellRuntime>();

	register(index: number, view: CellView): void {
		this.runtimes.set(index, {
			view,
			transition: null,
			feedback: null,
			charge: null
		});
	}

	unregisterRemoved(validIndices: Set<number>): void {
		for (const [index, runtime] of this.runtimes) {
			if (validIndices.has(index)) continue;
			this.killRuntime(runtime);
			this.runtimes.delete(index);
		}
	}

	playTransition(
		index: number,
		previousMark: CellMark,
		nextMark: CellMark,
		options: TransitionOptions = {}
	): void {
		const runtime = this.runtimes.get(index);
		if (!runtime) return;

		this.killTransition(runtime);

		if (previousMark === nextMark) {
			runtime.view.refresh();
			return;
		}

		if (previousMark === 'x' && nextMark === 'empty') {
			runtime.view.resetTransitionMotion();
			runtime.view.motion.baseScale = 1.02;
			runtime.view.motion.zBoost = 14;
			runtime.view.refresh();
			runtime.transition = gsap.to(runtime.view.motion, {
				baseScale: 1,
				zBoost: 0,
				duration: 0.12,
				ease: 'power2.out',
				delay: options.delay ?? 0,
				onUpdate: () => runtime.view.refresh(),
				onComplete: () => {
					runtime.view.resetTransitionMotion();
					runtime.view.refresh();
					runtime.transition = null;
				}
			});
			return;
		}

		if (nextMark === 'x' || nextMark === 'hypothesis') {
			runtime.view.resetTransitionMotion();
			runtime.view.motion.baseScale = 0.98;
			runtime.view.motion.markerScale = nextMark === 'hypothesis' ? 0.74 : 0.82;
			runtime.view.motion.markerAlpha = 0.18;
			runtime.view.motion.zBoost = 24;
			runtime.view.refresh();
			runtime.transition = gsap.timeline({
				delay: options.delay ?? 0,
				onComplete: () => {
					runtime.view.resetTransitionMotion();
					runtime.view.refresh();
					runtime.transition = null;
				}
			});
			runtime.transition
				.to(runtime.view.motion, {
					baseScale: 1.03,
					markerScale: 1.04,
					markerAlpha: 1,
					duration: nextMark === 'hypothesis' ? 0.18 : 0.12,
					ease: nextMark === 'hypothesis' ? 'back.out(1.5)' : 'power2.out',
					onUpdate: () => runtime.view.refresh()
				})
				.to(
					runtime.view.motion,
					{
						baseScale: 1,
						markerScale: 1,
						zBoost: 0,
						duration: 0.16,
						ease: 'power2.out',
						onUpdate: () => runtime.view.refresh()
					},
					0
				);
			return;
		}

		if (nextMark === 'queen') {
			runtime.view.resetTransitionMotion();
			runtime.view.resetFeedbackMotion();
			runtime.view.motion.baseScale = 0.96;
			runtime.view.motion.markerScale = 0.82;
			runtime.view.motion.markerAlpha = 0.42;
			runtime.view.motion.successAlpha = 0.34;
			runtime.view.motion.successProgress = 0;
			runtime.view.motion.zBoost = 95;
			runtime.view.refresh();
			runtime.transition = gsap.timeline({
				delay: options.delay ?? 0,
				onComplete: () => {
					runtime.view.resetTransitionMotion();
					runtime.view.resetFeedbackMotion();
					runtime.view.refresh();
					runtime.transition = null;
				}
			});
			runtime.transition
				.to(runtime.view.motion, {
					baseScale: 1.04,
					markerScale: 1.08,
					markerAlpha: 1,
					successProgress: 1,
					duration: 0.2,
					ease: 'back.out(1.4)',
					onUpdate: () => runtime.view.refresh()
				})
				.to(runtime.view.motion, {
					baseScale: 1,
					markerScale: 1,
					successAlpha: 0,
					zBoost: 0,
					duration: 0.18,
					ease: 'power2.out',
					onUpdate: () => runtime.view.refresh()
				});
			return;
		}

		if (nextMark === 'fixed-x') {
			runtime.view.resetTransitionMotion();
			runtime.view.resetFeedbackMotion();
			runtime.view.motion.markerScale = 0.86;
			runtime.view.motion.waveAlpha = 0.32;
			runtime.view.motion.waveProgress = 0;
			runtime.view.motion.zBoost = 42;
			runtime.view.refresh();
			runtime.transition = gsap.timeline({
				delay: options.delay ?? 0,
				onComplete: () => {
					runtime.view.resetTransitionMotion();
					runtime.view.resetFeedbackMotion();
					runtime.view.refresh();
					runtime.transition = null;
				}
			});
			runtime.transition
				.to(runtime.view.motion, {
					markerScale: 1,
					waveProgress: 1,
					duration: 0.24,
					ease: 'power2.out',
					onUpdate: () => runtime.view.refresh()
				})
				.to(
					runtime.view.motion,
					{
						waveAlpha: 0,
						zBoost: 0,
						duration: 0.18,
						ease: 'power1.out',
						onUpdate: () => runtime.view.refresh()
					},
					0.02
				);
			return;
		}

		runtime.view.resetTransitionMotion();
		runtime.view.refresh();
	}

	playFeedback(index: number, preset: AnimationPreset): void {
		const runtime = this.runtimes.get(index);
		if (!runtime || preset === 'none') return;

		this.killFeedback(runtime);

		switch (preset) {
			case 'queen-error': {
				runtime.view.resetFeedbackMotion();
				runtime.view.setBorderColorOverride(PIXI_THEME.feedback);
				runtime.view.motion.errorAlpha = 1;
				runtime.view.motion.errorProgress = 0;
				runtime.view.motion.zBoost = 96;
				runtime.view.refresh();
				runtime.feedback = gsap.to(runtime.view.motion, {
					errorProgress: 1,
					duration: 0.42,
					ease: 'power2.out',
					onUpdate: () => {
						const progress = runtime.view.motion.errorProgress;
						const damped = (1 - progress) * (1 - progress);
						runtime.view.motion.errorAlpha = 1 - progress * 0.18;
						runtime.view.motion.shakeX = Math.sin(progress * Math.PI * 10) * damped * 6;
						runtime.view.motion.shakeY =
							Math.sin(progress * Math.PI * 10 + Math.PI / 2) * damped * 4;
						runtime.view.refresh();
					},
					onComplete: () => {
						runtime.view.resetFeedbackMotion();
						runtime.view.refresh();
						runtime.feedback = null;
					}
				});
				return;
			}
			case 'queen-success': {
				runtime.view.resetFeedbackMotion();
				runtime.view.motion.successAlpha = 0.32;
				runtime.view.motion.successProgress = 0;
				runtime.view.motion.zBoost = 84;
				runtime.view.refresh();
				runtime.feedback = gsap.to(runtime.view.motion, {
					successProgress: 1,
					duration: 0.3,
					ease: 'power2.out',
					onUpdate: () => {
						runtime.view.motion.successAlpha =
							0.34 * (1 - runtime.view.motion.successProgress * 0.35);
						runtime.view.refresh();
					},
					onComplete: () => {
						runtime.view.resetFeedbackMotion();
						runtime.view.refresh();
						runtime.feedback = null;
					}
				});
				return;
			}
			case 'hypothesis-contradiction': {
				runtime.view.resetFeedbackMotion();
				runtime.view.setBorderColorOverride(PIXI_THEME.feedback);
				runtime.view.setMarkerColorOverride(PIXI_THEME.feedback);
				runtime.view.motion.pulseAlpha = 1;
				runtime.view.motion.pulseProgress = 0;
				runtime.view.motion.zBoost = 88;
				runtime.view.motion.borderWidthBoost = 2;
				runtime.view.refresh();
				runtime.feedback = gsap.to(runtime.view.motion, {
					pulseProgress: 1,
					duration: 0.42,
					ease: 'power2.out',
					onUpdate: () => {
						runtime.view.motion.pulseAlpha =
							0.9 -
							runtime.view.motion.pulseProgress * 0.18 +
							0.08 * Math.sin(runtime.view.motion.pulseProgress * Math.PI * 4);
						runtime.view.refresh();
					},
					onComplete: () => {
						runtime.view.resetFeedbackMotion();
						runtime.view.refresh();
						runtime.feedback = null;
					}
				});
				return;
			}
			case 'board-solved':
			case 'snapshot-saved': {
				runtime.view.resetFeedbackMotion();
				runtime.view.setWashColor(
					preset === 'board-solved' ? PIXI_THEME.solved : PIXI_THEME.accent
				);
				runtime.view.motion.washAlpha = 1;
				runtime.view.motion.washProgress = 0;
				runtime.view.motion.zBoost = 70;
				runtime.view.refresh();
				runtime.feedback = gsap.to(runtime.view.motion, {
					washProgress: 1,
					duration: preset === 'board-solved' ? 0.46 : 0.22,
					ease: 'power2.out',
					onUpdate: () => {
						runtime.view.motion.washAlpha = 1 - runtime.view.motion.washProgress * 0.45;
						runtime.view.refresh();
					},
					onComplete: () => {
						runtime.view.resetFeedbackMotion();
						runtime.view.refresh();
						runtime.feedback = null;
					}
				});
				return;
			}
			case 'mark-x':
			case 'erase-x':
			case 'hypothesis':
			default:
				return;
		}
	}

	startCharge(index: number, onComplete: () => void): void {
		const runtime = this.runtimes.get(index);
		if (!runtime) return;

		this.cancelCharge(index, true);
		runtime.view.motion.chargeProgress = 0;
		runtime.view.motion.zBoost = Math.max(runtime.view.motion.zBoost, 86);
		runtime.view.refresh();
		runtime.charge = gsap.to(runtime.view.motion, {
			chargeProgress: 1,
			duration: 0.52,
			ease: 'none',
			onUpdate: () => runtime.view.refresh(),
			onComplete: () => {
				runtime.charge = null;
				onComplete();
				gsap.to(runtime.view.motion, {
					chargeProgress: 0,
					duration: 0.1,
					ease: 'power2.out',
					onUpdate: () => runtime.view.refresh(),
					onComplete: () => runtime.view.refresh()
				});
			}
		});
	}

	cancelCharge(index: number, immediate = false): void {
		const runtime = this.runtimes.get(index);
		if (!runtime) return;
		if (runtime.charge) {
			runtime.charge.kill();
			runtime.charge = null;
		}
		if (immediate) {
			runtime.view.resetChargeMotion();
			runtime.view.refresh();
			return;
		}
		gsap.to(runtime.view.motion, {
			chargeProgress: 0,
			duration: 0.12,
			ease: 'power2.out',
			onUpdate: () => runtime.view.refresh(),
			onComplete: () => runtime.view.refresh()
		});
	}

	resetAll(): void {
		for (const runtime of this.runtimes.values()) {
			this.killRuntime(runtime);
			runtime.view.resetAllMotion();
		}
	}

	destroy(): void {
		for (const runtime of this.runtimes.values()) {
			this.killRuntime(runtime);
		}
		this.runtimes.clear();
	}

	private killRuntime(runtime: CellRuntime): void {
		this.killTransition(runtime);
		this.killFeedback(runtime);
		if (runtime.charge) {
			runtime.charge.kill();
			runtime.charge = null;
		}
	}

	private killTransition(runtime: CellRuntime): void {
		if (!runtime.transition) return;
		runtime.transition.kill();
		runtime.transition = null;
		runtime.view.resetTransitionMotion();
		runtime.view.refresh();
	}

	private killFeedback(runtime: CellRuntime): void {
		if (!runtime.feedback) return;
		runtime.feedback.kill();
		runtime.feedback = null;
		runtime.view.resetFeedbackMotion();
		runtime.view.refresh();
	}
}
