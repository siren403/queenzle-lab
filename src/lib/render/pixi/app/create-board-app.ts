import { Application } from 'pixi.js';

export async function createBoardApp(container: HTMLElement): Promise<Application> {
	const app = new Application();
	await app.init({
		backgroundAlpha: 0,
		antialias: true,
		resizeTo: container
	});
	container.appendChild(app.canvas);
	return app;
}
