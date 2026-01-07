/**
 * Manages the Undo/Redo stack for the editor.
 * Handles state snapshots including poses and item transformations.
 */
export class HistoryManager {
    /**
     * @param {Function} applyStateCallback - Function to call when a state needs to be restored.
     */
    constructor(applyStateCallback) {
        this.undoStack = [];
        this.redoStack = [];
        this.applyState = applyStateCallback;
        this.maxHistory = 50;
    }

    /**
     * Pushes a new state snapshot to the history stack.
     * Clears the Redo stack as a new timeline is created.
     * @param {Object} state - The snapshot object.
     */
    pushState(state) {
        this.redoStack = [];
        const stateStr = JSON.stringify(state);

        // Don't save if state hasn't changed
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === stateStr) {
            return;
        }

        this.undoStack.push(stateStr);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }

    /**
     * Reverts to the previous state.
     * @param {Object} currentState - The current state (to save into Redo before undoing).
     */
    undo(currentState) {
        if (this.undoStack.length === 0) return;

        this.redoStack.push(JSON.stringify(currentState));
        const prevStateStr = this.undoStack.pop();

        if (prevStateStr) {
            this.applyState(JSON.parse(prevStateStr));
        }
    }

    /**
     * Reapplies a previously undone state.
     * @param {Object} currentState - The current state (to save into Undo before redoing).
     */
    redo(currentState) {
        if (this.redoStack.length === 0) return;

        this.undoStack.push(JSON.stringify(currentState));
        const nextStateStr = this.redoStack.pop();

        if (nextStateStr) {
            this.applyState(JSON.parse(nextStateStr));
        }
    }
}