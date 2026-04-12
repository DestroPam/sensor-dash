// Drag and Drop функции

function setupDragAndDrop(container, isGrid = false) {
    const items = container.querySelectorAll(isGrid ? '.sensor-tile' : '.sensor-card');
    const location = isGrid ? 'grid' : 'list';
    items.forEach(item => {
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
            isDragging = true;
            draggedElement = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', (e) => {
            item.classList.remove('dragging');
            items.forEach(i => i.classList.remove('drag-over'));
            draggedElement = null;
            isDragging = false;
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (item !== draggedElement) {
                item.classList.add('drag-over');
            }
        });
        item.addEventListener('dragleave', (e) => {
            item.classList.remove('drag-over');
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            if (item !== draggedElement) {
                swapElements(draggedElement, item, container);
                saveDeviceOrder(container.querySelectorAll(isGrid ? '.sensor-tile' : '.sensor-card'), location);
            }
            item.classList.remove('drag-over');
        });
    });
}
