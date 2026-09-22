import '@kitware/vtk.js/Rendering/OpenGL/Profiles/Geometry';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkPlaneSource from '@kitware/vtk.js/Filters/Sources/PlaneSource';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import type { vtkObject } from '@kitware/vtk.js/interfaces';
import { planeWorld, type Geometry, type Plane, type Point } from './spatial';

export type SpatialRenderer = ReturnType<typeof createSpatialRenderer>;

export function createSpatialRenderer(
	container: HTMLElement,
	geometry: Geometry,
	onpick: (point: Point) => void
) {
	const view = vtkGenericRenderWindow.newInstance({
		background: [0.031, 0.031, 0.031],
		listenWindowResize: false
	});
	view.setContainer(container);
	const renderer = view.getRenderer();
	const window = view.getRenderWindow();
	const camera = renderer.getActiveCamera();
	const resources = [0, 1, 2].map(() => {
		const source = vtkPlaneSource.newInstance({ xResolution: 1, yResolution: 1 });
		const mapper = vtkMapper.newInstance();
		mapper.setInputConnection(source.getOutputPort());
		const actor = vtkActor.newInstance();
		actor.setMapper(mapper);
		actor.getProperty().setLighting(false);
		actor.getProperty().setEdgeVisibility(true);
		actor.getProperty().setEdgeColor(0.3, 0.3, 0.3);
		const texture = vtkTexture.newInstance({
			interpolate: false,
			repeat: false,
			edgeClamp: true,
			resizable: true
		}) as ReturnType<typeof vtkTexture.newInstance> & vtkObject;
		const image = vtkImageData.newInstance();
		image.setDimensions(2, 2, 1);
		const scalars = vtkDataArray.newInstance({ numberOfComponents: 4, values: new Uint8Array(16) });
		image.getPointData().setScalars(scalars);
		texture.setInputData(image);
		actor.addTexture(texture);
		renderer.addActor(actor);
		return { source, mapper, actor, texture, image, scalars };
	});
	const sphere = vtkSphereSource.newInstance({
		radius: geometry.step * 0.65,
		thetaResolution: 12,
		phiResolution: 12
	});
	const markerMapper = vtkMapper.newInstance();
	markerMapper.setInputConnection(sphere.getOutputPort());
	const marker = vtkActor.newInstance();
	marker.setMapper(markerMapper);
	marker.setPickable(false);
	marker.getProperty().setColor(0.85, 0.52, 0.47);
	marker.getProperty().setLighting(false);
	renderer.addActor(marker);
	const cube = vtkAnnotatedCubeActor.newInstance();
	cube.setDefaultStyle({
		fontFamily: 'sans-serif',
		fontColor: '#eeeeee',
		faceColor: '#303030',
		edgeColor: '#777777',
		faceRotation: 0,
		fontSizeScale: (resolution) => resolution * 0.6
	});
	cube.setXPlusFaceProperty({ text: 'R' });
	cube.setXMinusFaceProperty({ text: 'L' });
	cube.setYPlusFaceProperty({ text: 'A' });
	cube.setYMinusFaceProperty({ text: 'P' });
	cube.setZPlusFaceProperty({ text: 'S' });
	cube.setZMinusFaceProperty({ text: 'I' });
	const orientation = vtkOrientationMarkerWidget.newInstance({
		actor: cube,
		interactor: view.getInteractor()
	});
	orientation.setEnabled(true);
	orientation.setViewportSize(0.18);
	orientation.setMinPixelSize(45);
	orientation.setMaxPixelSize(80);
	const picker = vtkCellPicker.newInstance();
	picker.setPickFromList(true);
	resources.forEach(({ actor }) => picker.addPickList(actor));
	let start: { x: number; y: number; id: number } | undefined;
	const down = (e: PointerEvent) => {
		if (!e.isPrimary || e.button !== 0) {
			start = undefined;
			return;
		}
		start = { x: e.clientX, y: e.clientY, id: e.pointerId };
	};
	const up = (e: PointerEvent) => {
		if (!start || start.id !== e.pointerId) return;
		const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
		start = undefined;
		if (distance > 4 || e.shiftKey || e.ctrlKey || e.altKey) return;
		const bounds = container.getBoundingClientRect();
		const [width, height] = view.getApiSpecificRenderWindow().getSize();
		picker.pick(
			[
				((e.clientX - bounds.left) * width) / bounds.width,
				((bounds.bottom - e.clientY) * height) / bounds.height,
				0
			],
			renderer
		);
		if (picker.getCellId() >= 0) onpick(picker.getPickPosition() as Point);
	};
	const cancel = () => {
		start = undefined;
	};
	container.addEventListener('pointerdown', down);
	container.addEventListener('pointerup', up);
	container.addEventListener('pointercancel', cancel);
	container.addEventListener('pointerleave', cancel);
	const observer = new ResizeObserver(() => {
		if (container.clientWidth && container.clientHeight) view.resize();
	});
	observer.observe(container);
	const center = geometry.bounds.map(([min, max]) => (min + max) / 2) as Point;
	const extent = Math.max(...geometry.bounds.map(([min, max]) => max - min), geometry.step);
	function reset() {
		if (container.clientWidth && container.clientHeight) view.resize();
		camera.setFocalPoint(...center);
		camera.setPosition(center[0] + extent, center[1] - extent * 1.6, center[2] + extent * 0.8);
		camera.setViewUp(0, 0, 1);
		renderer.resetCamera();
		camera.dolly(1.5);
		renderer.resetCameraClippingRange();
		window.render();
	}
	return {
		update(planes: Plane[], pixels: Uint8ClampedArray[], world: Point) {
			planes.forEach((plane, i) => {
				const { source, image, scalars, texture } = resources[i];
				source.setOrigin(plane.origin);
				source.setPoint1(planeWorld(plane, 1, 0));
				source.setPoint2(planeWorld(plane, 0, 1));
				image.setDimensions(plane.width, plane.height, 1);
				scalars.setData(
					new Uint8Array(pixels[i].buffer, pixels[i].byteOffset, pixels[i].byteLength),
					4
				);
				image.modified();
				texture.modified();
			});
			sphere.setCenter(world);
			renderer.resetCameraClippingRange();
			if (container.clientWidth && container.clientHeight) window.render();
		},
		reset,
		rotate(degrees: number) {
			camera.azimuth(degrees);
			renderer.resetCameraClippingRange();
			window.render();
		},
		zoom(factor: number) {
			camera.dolly(factor);
			renderer.resetCameraClippingRange();
			window.render();
		},
		delete() {
			observer.disconnect();
			container.removeEventListener('pointerdown', down);
			container.removeEventListener('pointerup', up);
			container.removeEventListener('pointercancel', cancel);
			container.removeEventListener('pointerleave', cancel);
			orientation.setEnabled(false);
			orientation.delete();
			picker.delete();
			const interactor = view.getInteractor();
			const style = interactor.getInteractorStyle();
			view.delete();
			style.delete();
			interactor.delete();
			renderer.delete();
			window.delete();
			resources.forEach((resource) => Object.values(resource).forEach((object) => object.delete()));
			marker.delete();
			markerMapper.delete();
			sphere.delete();
			cube.delete();
		}
	};
}
