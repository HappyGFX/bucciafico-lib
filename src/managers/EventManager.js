/**
 * Custom Event Emitter implementation.
 * Handles Pub/Sub architecture to decouple Core from Plugins and UI.
 */
export class EventManager {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} event - Event name (e.g. 'skin:loaded').
     * @param {Function} callback - Function to execute.
     * @returns {Function} Unsubscribe function for convenience.
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        // Return unsubscribe function pattern
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event.
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Subscribe to an event only once.
     * @param {string} event
     * @param {Function} callback
     */
    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    /**
     * Emit an event with optional data.
     * @param {string} event
     * @param {*} [data]
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Error in listener for event "${event}":`, e);
                }
            });
        }
    }

    /**
     * Clears all listeners. Used for disposal.
     */
    dispose() {
        this.listeners.clear();
    }
}