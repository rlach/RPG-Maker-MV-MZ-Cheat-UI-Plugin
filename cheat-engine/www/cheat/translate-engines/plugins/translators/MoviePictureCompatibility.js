/** Select MoviePicture's existing canvas-backed bitmap through its alpha route.
 * Keep the native factory, receiver and other arguments; no picture/save flags
 * or source media are changed. The translator lifecycle guards installation.
 */
export function useCanvasMoviePictureFactory(manager) {
    const getVideoClass = manager.getVideoClass;
    manager.getVideoClass = function (_alpha, ...args) {
        return getVideoClass.call(this, true, ...args);
    };
}
