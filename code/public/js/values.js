document.addEventListener("DOMContentLoaded", () => {

    /* =========================================================
       CONFIGURATION
    ========================================================= */
  
    const API_BASE = "/api/values";
  
    const CATEGORY_CONFIG = {
      category1: {
        label: "Category 1",
        description:
          "Values that feel especially important to you."
      },
  
      category2: {
        label: "Category 2",
        description:
          "Values that matter to you and shape your life."
      },
  
      category3: {
        label: "Category 3",
        description:
          "Values that are meaningful, but less central."
      }
    };
  
    const CATEGORIES =
      Object.keys(CATEGORY_CONFIG);
  
  
    /* =========================================================
       STATE
    ========================================================= */
  
    const state = {
      currentStep: 1,
  
      selectedValues: [],
  
      categories: {
        category1: [],
        category2: [],
        category3: []
      },
  
      unassignedValues: [],
  
      coreValues: {
        category1: null,
        category2: null,
        category3: null
      },
  
      completed: false,
  
      completedAt: null,
  
      loading: false,
  
      saving: false
    };
  
  
    /* =========================================================
       DOM HELPERS
    ========================================================= */
  
    function $(selector, parent = document) {
      return parent.querySelector(selector);
    }
  
  
    function $$(selector, parent = document) {
      return Array.from(
        parent.querySelectorAll(selector)
      );
    }
  
  
    /* =========================================================
       DOM ELEMENTS
    ========================================================= */
  
    const elements = {
  
      progressBar:
        $("#progressBar"),
  
      progressText:
        $("#progressText"),
  
      valuesGrid:
        $("#valuesGrid"),
  
      selectionCount:
        $("#selectionCount"),
  
      unassignedCount:
        $("#unassignedCount"),
  
      step1:
        $("#step1"),
  
      step2:
        $("#step2"),
  
      step3:
        $("#step3"),
  
      step4:
        $("#step4"),
  
      sortError:
        $("#sortError"),
  
      coreError:
        $("#coreError"),
  
      nextSelection:
        $("#nextSelection"),
  
      nextSorting:
        $("#nextSorting"),
  
      completeButton:
        $("#completeValues"),
  
      coreValueCategories:
        $("#coreValueCategories"),
  
      completionCoreValues:
        $("#completionCoreValues"),
  
      completionCategories:
        $("#completionCategories")
    };
  
  
    /* =========================================================
       INITIALIZATION
    ========================================================= */
  
    async function initialize() {
  
      setButtonsDisabled(true);
  
      try {
  
        await loadSavedValues();
  
        initializeSelectionCards();
  
        initializeNavigation();
  
        initializeSorting();
  
        reconcileState();
  
        restoreSavedState();
  
        if (state.completed) {
  
          renderCompletion();
  
          showStep(4);
  
        } else {
  
          showStep(
            state.currentStep || 1
          );
        }
  
      } catch (error) {
  
        console.error(
          "Values activity initialization error:",
          error
        );
  
        showGlobalError(
          "We couldn't load your saved values. Please refresh the page and try again."
        );
  
      } finally {
  
        setButtonsDisabled(false);
      }
    }
  
  
    /* =========================================================
       LOAD SAVED VALUES
    ========================================================= */
  
    async function loadSavedValues() {
  
      state.loading = true;
  
      try {
  
        const response = await fetch(
          API_BASE,
          {
            method: "GET",
            credentials: "include",
            headers: {
              Accept: "application/json"
            }
          }
        );
  
        const data =
          await parseJsonResponse(response);
  
        if (!response.ok || !data.success) {
  
          throw new Error(
            data?.error ||
            "Unable to load saved values."
          );
        }
  
        const saved =
          data.valuesExercise || {};
  
  
        state.selectedValues =
          cleanValues(
            saved.selectedValues
          );
  
  
        state.categories = {
          category1:
            cleanValues(
              saved.categories?.category1
            ),
  
          category2:
            cleanValues(
              saved.categories?.category2
            ),
  
          category3:
            cleanValues(
              saved.categories?.category3
            )
        };
  
  
        state.coreValues = {
          category1:
            cleanSingleValue(
              saved.coreValues?.category1
            ),
  
          category2:
            cleanSingleValue(
              saved.coreValues?.category2
            ),
  
          category3:
            cleanSingleValue(
              saved.coreValues?.category3
            )
        };
  
  
        state.completed =
          saved.completed === true;
  
        state.completedAt =
          saved.completedAt || null;
  
  
        reconcileState();
  
        determineCurrentStep();
  
      } finally {
  
        state.loading = false;
      }
    }
  
  
    /* =========================================================
       RESPONSE HELPER
    ========================================================= */
  
    async function parseJsonResponse(response) {
  
      try {
  
        return await response.json();
  
      } catch {
  
        throw new Error(
          "Invalid response from server."
        );
      }
    }
  
  
    /* =========================================================
       CLEAN VALUES
    ========================================================= */
  
    function cleanValues(values) {
  
      if (!Array.isArray(values)) {
        return [];
      }
  
      return [
        ...new Set(
          values
            .filter(
              value =>
                typeof value === "string"
            )
            .map(
              value =>
                value.trim()
            )
            .filter(Boolean)
        )
      ];
    }
  
  
    function cleanSingleValue(value) {
  
      if (
        typeof value !== "string"
      ) {
  
        return null;
      }
  
      const cleaned =
        value.trim();
  
      return cleaned || null;
    }
  
  
    /* =========================================================
       RECONCILE STATE
    ========================================================= */
  
    function reconcileState() {
  
      const selectedSet =
        new Set(state.selectedValues);
  
  
      CATEGORIES.forEach(
        category => {
  
          state.categories[category] =
            cleanValues(
              state.categories[category]
            ).filter(
              value =>
                selectedSet.has(value)
            );
        }
      );
  
  
      /*
       * Remove duplicate values across
       * categories.
       */
  
      const seen =
        new Set();
  
      CATEGORIES.forEach(
        category => {
  
          state.categories[category] =
            state.categories[category]
              .filter(value => {
  
                if (seen.has(value)) {
                  return false;
                }
  
                seen.add(value);
  
                return true;
              });
        }
      );
  
  
      /*
       * Anything selected but not sorted
       * belongs in unassigned.
       */
  
      const sorted =
        new Set(
          getAllSortedValues()
        );
  
      state.unassignedValues =
        state.selectedValues.filter(
          value =>
            !sorted.has(value)
        );
  
  
      /*
       * Core values must still belong to
       * their respective category.
       */
  
      CATEGORIES.forEach(
        category => {
  
          const core =
            state.coreValues[category];
  
          if (
            !core ||
            !state.categories[category]
              .includes(core)
          ) {
  
            state.coreValues[category] =
              null;
          }
        }
      );
  
  
      /*
       * If core values aren't complete,
       * the exercise cannot be completed.
       */
  
      const coreComplete =
        CATEGORIES.every(
          category =>
            Boolean(
              state.coreValues[category]
            )
        );
  
      if (!coreComplete) {
  
        state.completed =
          false;
  
        state.completedAt =
          null;
      }
    }
  
  
    /* =========================================================
       DETERMINE CURRENT STEP
    ========================================================= */
  
    function determineCurrentStep() {
  
      if (state.completed) {
  
        state.currentStep = 4;
  
        return;
      }
  
  
      if (
        CATEGORIES.some(
          category =>
            state.coreValues[category]
        )
      ) {
  
        state.currentStep = 3;
  
        return;
      }
  
  
      if (
        getAllSortedValues().length > 0
      ) {
  
        state.currentStep = 2;
  
        return;
      }
  
  
      state.currentStep = 1;
    }
  
  
    /* =========================================================
       SELECTION CARDS
    ========================================================= */
  
    function initializeSelectionCards() {
  
      if (!elements.valuesGrid) {
        return;
      }
  
      $$(".values-selection-card")
        .forEach(card => {
  
          card.addEventListener(
            "click",
            () => {
  
              if (
                state.saving ||
                state.loading
              ) {
  
                return;
              }
  
              const value =
                card.dataset.value;
  
              if (!value) {
                return;
              }
  
              toggleSelectedValue(
                value
              );
  
              updateSelectionUI();
            }
          );
        });
  
      updateSelectionUI();
    }
  
  
    function toggleSelectedValue(value) {
  
      const index =
        state.selectedValues.indexOf(
          value
        );
  
      if (index === -1) {
  
        state.selectedValues.push(
          value
        );
  
      } else {
  
        state.selectedValues.splice(
          index,
          1
        );
      }
  
  
      /*
       * Immediately keep client state
       * consistent when a value is removed.
       */
  
      reconcileState();
  
      updateSortingUI();
    }
  
  
    function updateSelectionUI() {
  
      if (!elements.valuesGrid) {
        return;
      }
  
      $$(".values-selection-card")
        .forEach(card => {
  
          const value =
            card.dataset.value;
  
          const selected =
            state.selectedValues.includes(
              value
            );
  
          card.classList.toggle(
            "selected",
            selected
          );
  
          card.setAttribute(
            "aria-pressed",
            selected
              ? "true"
              : "false"
          );
        });
  
  
      if (elements.selectionCount) {
  
        elements.selectionCount.textContent =
          state.selectedValues.length;
      }
  
  
      if (elements.nextSelection) {
  
        elements.nextSelection.disabled =
          state.saving ||
          state.selectedValues.length === 0;
      }
    }
  
  
    /* =========================================================
       NAVIGATION
    ========================================================= */
  
    function initializeNavigation() {
  
      elements.nextSelection?.addEventListener(
        "click",
        handleSelectionNext
      );
  
  
      elements.nextSorting?.addEventListener(
        "click",
        handleSortingNext
      );
  
  
      elements.completeButton?.addEventListener(
        "click",
        handleCompletion
      );
  
  
      $$("[data-values-back]")
        .forEach(button => {
  
          button.addEventListener(
            "click",
            () => {
  
              const step =
                Number(
                  button.dataset.valuesBack
                );
  
              if (
                Number.isInteger(step) &&
                step >= 1 &&
                step <= 3
              ) {
  
                clearErrors();
  
                showStep(step);
              }
            }
          );
        });
  
  
      $$("[data-values-restart]")
        .forEach(button => {
  
          button.addEventListener(
            "click",
            handleRestart
          );
        });
    }
  
  
    /* =========================================================
       STEP 1 → STEP 2
    ========================================================= */
  
    async function handleSelectionNext() {
  
      clearErrors();
  
      if (
        state.selectedValues.length === 0
      ) {
  
        showGlobalError(
          "Please select at least one value before continuing."
        );
  
        return;
      }
  
  
      /*
       * Reconcile before saving.
       */
  
      reconcileState();
  
      const saved =
        await saveSelectedValues();
  
      if (!saved) {
        return;
      }
  
  
      reconcileState();
  
      renderSortingBoard();
  
      showStep(2);
    }
  
  
    /* =========================================================
       SAVE SELECTION
    ========================================================= */
  
    async function saveSelectedValues() {
  
      setSaving(true);
  
      try {
  
        const response =
          await fetch(
            `${API_BASE}/selection`,
            {
              method: "PUT",
  
              credentials: "include",
  
              headers: {
                "Content-Type":
                  "application/json",

                Accept:
                  "application/json",

                "X-CSRF-Token":
                  window.CSRF_TOKEN
              },
  
              body:
                JSON.stringify({
                  selectedValues:
                    state.selectedValues
                })
            }
          );
  
  
        const data =
          await parseJsonResponse(
            response
          );
  
  
        if (
          !response.ok ||
          !data.success
        ) {
  
          throw new Error(
            data?.error ||
            "Unable to save your selected values."
          );
        }
  
  
        applyServerState(
          data.valuesExercise
        );
  
  
        return true;
  
      } catch (error) {
  
        console.error(
          "Save selected values error:",
          error
        );
  
        showGlobalError(
          error.message ||
          "We couldn't save your selections. Please try again."
        );
  
        return false;
  
      } finally {
  
        setSaving(false);
      }
    }
  
  
    /* =========================================================
       APPLY SERVER STATE
    ========================================================= */
  
    function applyServerState(saved) {
  
      if (!saved) {
        return;
      }
  
      state.selectedValues =
        cleanValues(
          saved.selectedValues
        );
  
      state.categories = {
        category1:
          cleanValues(
            saved.categories?.category1
          ),
  
        category2:
          cleanValues(
            saved.categories?.category2
          ),
  
        category3:
          cleanValues(
            saved.categories?.category3
          )
      };
  
      state.coreValues = {
        category1:
          cleanSingleValue(
            saved.coreValues?.category1
          ),
  
        category2:
          cleanSingleValue(
            saved.coreValues?.category2
          ),
  
        category3:
          cleanSingleValue(
            saved.coreValues?.category3
          )
      };
  
      state.completed =
        saved.completed === true;
  
      state.completedAt =
        saved.completedAt || null;
  
      reconcileState();
    }
  
  
    /* =========================================================
       SORTING
    ========================================================= */
  
    function initializeSorting() {
  
      document.addEventListener(
        "dragstart",
        handleDragStart
      );
  
      document.addEventListener(
        "dragover",
        handleDragOver
      );
  
      document.addEventListener(
        "dragleave",
        handleDragLeave
      );
  
      document.addEventListener(
        "drop",
        handleDrop
      );
  
      document.addEventListener(
        "dragend",
        handleDragEnd
      );
  
  
      /*
       * Mobile / touch fallback.
       *
       * Tapping a value advances it through:
       *
       * Unassigned → Category 1
       * Category 1 → Category 2
       * Category 2 → Category 3
       * Category 3 → Unassigned
       */
  
      document.addEventListener(
        "click",
        handleSortableValueClick
      );
    }
  
  
    let draggedValue = null;
  
  
    function handleDragStart(event) {
  
      const element =
        event.target.closest(
          ".values-sortable-value"
        );
  
      if (!element) {
        return;
      }
  
      draggedValue =
        element.dataset.value;
  
      element.classList.add(
        "dragging"
      );
  
  
      if (event.dataTransfer) {
  
        event.dataTransfer.effectAllowed =
          "move";
  
        event.dataTransfer.setData(
          "text/plain",
          draggedValue
        );
      }
    }
  
  
    function handleDragOver(event) {
  
      const dropZone =
        event.target.closest(
          ".values-drop-zone, .values-unassigned-zone"
        );
  
      if (!dropZone) {
        return;
      }
  
      event.preventDefault();
  
      dropZone.classList.add(
        "drag-over"
      );
  
      if (event.dataTransfer) {
  
        event.dataTransfer.dropEffect =
          "move";
      }
    }
  
  
    function handleDragLeave(event) {
  
      const dropZone =
        event.target.closest(
          ".values-drop-zone, .values-unassigned-zone"
        );
  
      if (!dropZone) {
        return;
      }
  
  
      if (
        event.relatedTarget &&
        dropZone.contains(
          event.relatedTarget
        )
      ) {
  
        return;
      }
  
  
      dropZone.classList.remove(
        "drag-over"
      );
    }
  
  
    function handleDrop(event) {
  
      const dropZone =
        event.target.closest(
          ".values-drop-zone, .values-unassigned-zone"
        );
  
      if (!dropZone) {
        return;
      }
  
      event.preventDefault();
  
      dropZone.classList.remove(
        "drag-over"
      );
  
  
      let value =
        draggedValue;
  
      if (
        !value &&
        event.dataTransfer
      ) {
  
        value =
          event.dataTransfer.getData(
            "text/plain"
          );
      }
  
  
      if (!value) {
        return;
      }
  
  
      const category =
        dropZone.dataset.category;
  
  
      moveValueToCategory(
        value,
        category
      );
  
  
      renderSortingBoard();
    }
  
  
    function handleDragEnd(event) {
  
      const element =
        event.target.closest(
          ".values-sortable-value"
        );
  
      element?.classList.remove(
        "dragging"
      );
  
  
      $(
        ".values-drop-zone"
      );
  
  
      $$(".values-drop-zone, .values-unassigned-zone")
        .forEach(zone => {
  
          zone.classList.remove(
            "drag-over"
          );
        });
  
  
      draggedValue = null;
    }
  
  
    /* =========================================================
       MOBILE SORTING
    ========================================================= */
  
    function handleSortableValueClick(event) {
  
      /*
       * Don't treat desktop drag interactions
       * as mobile taps.
       */
  
      if (window.matchMedia(
        "(hover: hover) and (pointer: fine)"
      ).matches) {
  
        return;
      }
  
  
      const element =
        event.target.closest(
          ".values-sortable-value"
        );
  
      if (!element) {
        return;
      }
  
  
      const value =
        element.dataset.value;
  
      if (!value) {
        return;
      }
  
  
      const currentCategory =
        getValueCategory(value);
  
  
      const nextCategory =
        getNextCategory(
          currentCategory
        );
  
  
      moveValueToCategory(
        value,
        nextCategory
      );
  
  
      renderSortingBoard();
    }
  
  
    function getNextCategory(
      currentCategory
    ) {
  
      if (
        currentCategory === "unassigned"
      ) {
  
        return "category1";
      }
  
      if (
        currentCategory === "category1"
      ) {
  
        return "category2";
      }
  
      if (
        currentCategory === "category2"
      ) {
  
        return "category3";
      }
  
      return "unassigned";
    }
  
  
    function getValueCategory(value) {
  
      if (
        state.unassignedValues.includes(
          value
        )
      ) {
  
        return "unassigned";
      }
  
  
      for (
        const category of CATEGORIES
      ) {
  
        if (
          state.categories[
            category
          ].includes(value)
        ) {
  
          return category;
        }
      }
  
  
      return "unassigned";
    }
  
  
    /* =========================================================
       MOVE VALUE
    ========================================================= */
  
    function moveValueToCategory(
      value,
      category
    ) {
  
      /*
       * Remove the value everywhere.
       */
  
      CATEGORIES.forEach(
        categoryName => {
  
          state.categories[
            categoryName
          ] =
            state.categories[
              categoryName
            ].filter(
              existingValue =>
                existingValue !== value
            );
        }
      );
  
  
      state.unassignedValues =
        state.unassignedValues.filter(
          existingValue =>
            existingValue !== value
        );
  
  
      /*
       * Put it where requested.
       */
  
      if (
        category === "unassigned"
      ) {
  
        if (
          state.selectedValues.includes(
            value
          )
        ) {
  
          state.unassignedValues.push(
            value
          );
        }
  
        return;
      }
  
  
      if (
        CATEGORIES.includes(category) &&
        state.selectedValues.includes(value)
      ) {
  
        state.categories[
          category
        ].push(value);
      }
    }
  
  
    /* =========================================================
       RENDER SORTING BOARD
    ========================================================= */
  
    function renderSortingBoard() {
  
      reconcileState();
  
  
      const dropZones =
        $$(".values-drop-zone");
  
  
      dropZones.forEach(
        zone => {
  
          zone.innerHTML = "";
        }
      );
  
  
      const unassignedZone =
        $(".values-unassigned-zone");
  
  
      if (unassignedZone) {
  
        unassignedZone.innerHTML = "";
  
        state.unassignedValues
          .forEach(value => {
  
            unassignedZone.appendChild(
              createSortableValue(
                value
              )
            );
          });
      }
  
  
      CATEGORIES.forEach(
        category => {
  
          const zone =
            document.querySelector(
              `.values-drop-zone[data-category="${category}"]`
            );
  
          if (!zone) {
            return;
          }
  
  
          state.categories[
            category
          ].forEach(value => {
  
            zone.appendChild(
              createSortableValue(
                value
              )
            );
          });
  
  
          updateCategoryCount(
            category
          );
        }
      );
  
  
      updateSortingUI();
    }
  
  
    function createSortableValue(
      value
    ) {
  
      const element =
        document.createElement(
          "div"
        );
  
      element.className =
        "values-sortable-value";
  
      element.draggable =
        true;
  
      element.dataset.value =
        value;
  
      element.textContent =
        value;
  
      element.setAttribute(
        "role",
        "listitem"
      );
  
      element.setAttribute(
        "tabindex",
        "0"
      );
  
      element.setAttribute(
        "aria-label",
        `${value}. Tap to move to the next category.`
      );
  
      return element;
    }
  
  
    function updateCategoryCount(
      category
    ) {
  
      const element =
        document.querySelector(
          `[data-count="${category}"]`
        );
  
      if (!element) {
        return;
      }
  
      element.textContent =
        state.categories[
          category
        ].length;
    }
  
  
    function updateSortingUI() {
  
      CATEGORIES.forEach(
        category => {
  
          updateCategoryCount(
            category
          );
        }
      );
  
  
      if (elements.unassignedCount) {
  
        elements.unassignedCount.textContent =
          state.unassignedValues.length;
      }
    }
  
  
    function getAllSortedValues() {
  
      return CATEGORIES.flatMap(
        category =>
          state.categories[
            category
          ]
      );
    }
  
  
    /* =========================================================
       RESTORE STATE
    ========================================================= */
  
    function restoreSavedState() {
  
      updateSelectionUI();
  
      renderSortingBoard();
  
      renderCoreValueChoices();
  
      updateCoreButton();
    }
  
  
    /* =========================================================
       VALIDATE SORTING
    ========================================================= */
  
    function validateSorting() {
  
      const selected =
        state.selectedValues;
  
      const sorted =
        getAllSortedValues();
  
  
      if (
        state.unassignedValues.length > 0
      ) {
  
        return {
          valid: false,
  
          message:
            "Please place every value into one of the three categories before continuing."
        };
      }
  
  
      if (
        sorted.length !== selected.length
      ) {
  
        return {
          valid: false,
  
          message:
            "Please place every value into one of the three categories before continuing."
        };
      }
  
  
      const selectedSet =
        new Set(selected);
  
      const sortedSet =
        new Set(sorted);
  
  
      if (
        sortedSet.size !==
        sorted.length
      ) {
  
        return {
          valid: false,
  
          message:
            "Each value can only appear in one category."
        };
      }
  
  
      if (
        sortedSet.size !==
        selectedSet.size ||
        !selected.every(
          value =>
            sortedSet.has(value)
        )
      ) {
  
        return {
          valid: false,
  
          message:
            "Every selected value must be assigned to a category."
        };
      }
  
  
      return {
        valid: true
      };
    }
  
  
    /* =========================================================
       STEP 2 → STEP 3
    ========================================================= */
  
    async function handleSortingNext() {
  
      clearErrors();
  
      reconcileState();
  
      const validation =
        validateSorting();
  
  
      if (!validation.valid) {
  
        showSortError(
          validation.message
        );
  
        return;
      }
  
  
      const saved =
        await saveSortedValues();
  
  
      if (!saved) {
        return;
      }
  
  
      renderCoreValueChoices();
  
      showStep(3);
    }
  
  
    /* =========================================================
       SAVE SORTING
    ========================================================= */
  
    async function saveSortedValues() {
  
      setSaving(true);
  
      try {
  
        const response =
          await fetch(
            `${API_BASE}/sorting`,
            {
              method: "PUT",
  
              credentials: "include",
  
              headers: {
                "Content-Type":
                  "application/json",

                Accept:
                  "application/json",

                "X-CSRF-Token":
                  window.CSRF_TOKEN
              },
  
              body:
                JSON.stringify({
                  categories:
                    state.categories
                })
            }
          );
  
  
        const data =
          await parseJsonResponse(
            response
          );
  
  
        if (
          !response.ok ||
          !data.success
        ) {
  
          throw new Error(
            data?.error ||
            "Unable to save your categories."
          );
        }
  
  
        applyServerState(
          data.valuesExercise
        );
  
  
        return true;
  
      } catch (error) {
  
        console.error(
          "Save sorting error:",
          error
        );
  
        showSortError(
          error.message ||
          "We couldn't save your categories. Please try again."
        );
  
        return false;
  
      } finally {
  
        setSaving(false);
      }
    }
  
  
    /* =========================================================
       CORE VALUES
    ========================================================= */
  
    function renderCoreValueChoices() {
  
      if (
        !elements.coreValueCategories
      ) {
  
        return;
      }
  
  
      elements.coreValueCategories.innerHTML =
        "";
  
  
      CATEGORIES.forEach(
        category => {
  
          const config =
            CATEGORY_CONFIG[
              category
            ];
  
  
          const wrapper =
            document.createElement(
              "div"
            );
  
          wrapper.className =
            "core-category";
  
  
          const heading =
            document.createElement(
              "h2"
            );
  
          heading.textContent =
            config.label;
  
  
          const description =
            document.createElement(
              "p"
            );
  
          description.className =
            "core-category-description";
  
          description.textContent =
            "Choose the one value that feels most central to you.";
  
  
          const options =
            document.createElement(
              "div"
            );
  
          options.className =
            "core-options";
  
  
          const categoryValues =
            state.categories[
              category
            ] || [];
  
  
          categoryValues.forEach(
            value => {
  
              const option =
                document.createElement(
                  "button"
                );
  
              option.type =
                "button";
  
              option.className =
                "core-option";
  
              option.dataset.value =
                value;
  
              option.dataset.category =
                category;
  
              option.textContent =
                value;
  
  
              const selected =
                state.coreValues[
                  category
                ] === value;
  
  
              option.setAttribute(
                "aria-pressed",
                selected
                  ? "true"
                  : "false"
              );
  
  
              if (selected) {
  
                option.classList.add(
                  "selected"
                );
              }
  
  
              option.addEventListener(
                "click",
                () => {
  
                  selectCoreValue(
                    category,
                    value
                  );
                }
              );
  
  
              options.appendChild(
                option
              );
            }
          );
  
  
          wrapper.appendChild(
            heading
          );
  
          wrapper.appendChild(
            description
          );
  
          wrapper.appendChild(
            options
          );
  
  
          elements.coreValueCategories
            .appendChild(
              wrapper
            );
        }
      );
  
  
      updateCoreButton();
    }
  
  
    function selectCoreValue(
      category,
      value
    ) {
  
      state.coreValues[
        category
      ] = value;
  
  
      $$(".core-option")
        .forEach(option => {
  
          if (
            option.dataset.category !==
            category
          ) {
  
            return;
          }
  
  
          const selected =
            option.dataset.value ===
            value;
  
  
          option.classList.toggle(
            "selected",
            selected
          );
  
  
          option.setAttribute(
            "aria-pressed",
            selected
              ? "true"
              : "false"
          );
        });
  
  
      clearErrors();
  
      updateCoreButton();
    }
  
  
    function updateCoreButton() {
  
      if (
        !elements.completeButton
      ) {
  
        return;
      }
  
  
      const complete =
        CATEGORIES.every(
          category =>
            typeof state.coreValues[
              category
            ] === "string" &&
            state.coreValues[
              category
            ].trim().length > 0
        );
  
  
      elements.completeButton.disabled =
        state.saving ||
        !complete;
    }
  
  
    /* =========================================================
       VALIDATE CORE VALUES
    ========================================================= */
  
    function validateCoreValues() {
  
      for (
        const category of CATEGORIES
      ) {
  
        const value =
          state.coreValues[
            category
          ];
  
  
        if (
          typeof value !== "string" ||
          !value.trim()
        ) {
  
          return {
            valid: false,
  
            message:
              "Please choose one core value from each category."
          };
        }
  
  
        if (
          !state.categories[
            category
          ].includes(value)
        ) {
  
          return {
            valid: false,
  
            message:
              "One of your selected core values is invalid. Please choose again."
          };
        }
      }
  
  
      return {
        valid: true
      };
    }
  
  
    /* =========================================================
       COMPLETE
    ========================================================= */
  
    async function handleCompletion() {
  
      clearErrors();
  
      reconcileState();
  
  
      const validation =
        validateCoreValues();
  
  
      if (!validation.valid) {
  
        showCoreError(
          validation.message
        );
  
        return;
      }
  
  
      const saved =
        await saveCoreValues();
  
  
      if (!saved) {
        return;
      }
  
  
      state.completed =
        true;
  
  
      renderCompletion();
  
      showStep(4);
    }
  
  
    /* =========================================================
       SAVE CORE VALUES
    ========================================================= */
  
    async function saveCoreValues() {
  
      setSaving(true);
  
      try {
  
        const response =
          await fetch(
            `${API_BASE}/core`,
            {
              method: "PUT",
  
              credentials: "include",
  
              headers: {
                "Content-Type":
                  "application/json",

                Accept:
                  "application/json",

                "X-CSRF-Token":
                  window.CSRF_TOKEN
              },
  
              body:
                JSON.stringify({
                  coreValues:
                    state.coreValues
                })
            }
          );
  
  
        const data =
          await parseJsonResponse(
            response
          );
  
  
        if (
          !response.ok ||
          !data.success
        ) {
  
          throw new Error(
            data?.error ||
            "Unable to save your core values."
          );
        }
  
  
        applyServerState(
          data.valuesExercise
        );
  
  
        return true;
  
      } catch (error) {
  
        console.error(
          "Save core values error:",
          error
        );
  
        showCoreError(
          error.message ||
          "We couldn't save your core values. Please try again."
        );
  
        return false;
  
      } finally {
  
        setSaving(false);
      }
    }
  
  
    /* =========================================================
       COMPLETION
    ========================================================= */
  
    function renderCompletion() {
  
      if (
        elements.completionCoreValues
      ) {
  
        elements.completionCoreValues.innerHTML =
          "";
  
  
        CATEGORIES.forEach(
          category => {
  
            const wrapper =
              document.createElement(
                "div"
              );
  
            wrapper.className =
              "core-result";
  
  
            const label =
              document.createElement(
                "div"
              );
  
            label.className =
              "core-result-label";
  
            label.textContent =
              CATEGORY_CONFIG[
                category
              ].label;
  
  
            const value =
              document.createElement(
                "div"
              );
  
            value.className =
              "core-result-value";
  
            value.textContent =
              state.coreValues[
                category
              ] || "—";
  
  
            wrapper.appendChild(
              label
            );
  
            wrapper.appendChild(
              value
            );
  
  
            elements.completionCoreValues
              .appendChild(
                wrapper
              );
          }
        );
      }
  
  
      if (
        elements.completionCategories
      ) {
  
        elements.completionCategories.innerHTML =
          "";
  
  
        CATEGORIES.forEach(
          category => {
  
            const wrapper =
              document.createElement(
                "div"
              );
  
            wrapper.className =
              "result-category";
  
  
            const heading =
              document.createElement(
                "h3"
              );
  
            heading.textContent =
              CATEGORY_CONFIG[
                category
              ].label;
  
  
            const list =
              document.createElement(
                "ul"
              );
  
  
            const categoryValues =
              state.categories[
                category
              ] || [];
  
  
            categoryValues.forEach(
              value => {
  
                const item =
                  document.createElement(
                    "li"
                  );
  
                item.textContent =
                  value;
  
                list.appendChild(
                  item
                );
              }
            );

            wrapper.appendChild(
              list
            );
  
  
            elements.completionCategories
              .appendChild(
                wrapper
              );
          }
        );
      }
    }
  
  
    /* =========================================================
       SHOW STEP
    ========================================================= */
  
    function showStep(stepNumber) {
  
      const validStep =
        [1, 2, 3, 4].includes(
          Number(stepNumber)
        )
          ? Number(stepNumber)
          : 1;
  
  
      state.currentStep =
        validStep;
  
  
      const steps = [
        elements.step1,
        elements.step2,
        elements.step3,
        elements.step4
      ];
  
  
      steps.forEach(
        (step, index) => {
  
          if (!step) {
            return;
          }
  
  
          const active =
            index + 1 === validStep;
  
  
          step.classList.toggle(
            "active",
            active
          );
  
  
          step.setAttribute(
            "aria-hidden",
            active
              ? "false"
              : "true"
          );
        }
      );
  
  
      updateProgress();
  
  
      if (validStep === 2) {
  
        renderSortingBoard();
      }
  
  
      if (validStep === 3) {
  
        renderCoreValueChoices();
      }
  
  
      if (validStep === 4) {
  
        renderCompletion();
      }
  
  
      const activity =
        $(".values-app");
  
  
      if (activity) {
  
        activity.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    }
  
  
    /* =========================================================
       PROGRESS
    ========================================================= */
  
    function updateProgress() {
  
      if (
        !elements.progressBar
      ) {
  
        return;
      }
  
  
      const percentage =
        state.currentStep === 4
          ? 100
          : (
              state.currentStep /
              3
            ) * 100;
  
  
      elements.progressBar.style.width =
        `${percentage}%`;
  
  
      if (
        elements.progressText
      ) {
  
        elements.progressText.textContent =
          state.currentStep === 4
            ? "Complete"
            : `Step ${state.currentStep} of 3`;
      }
    }
  
  
    /* =========================================================
       ERRORS
    ========================================================= */
  
    function clearErrors() {
  
      [
        elements.sortError,
        elements.coreError
      ].forEach(
        element => {
  
          if (!element) {
            return;
          }
  
          element.textContent =
            "";
  
          element.classList.remove(
            "show"
          );
        }
      );
  
  
      const global =
        $("#valuesError");
  
  
      if (global) {
  
        global.textContent =
          "";
  
        global.classList.remove(
          "show"
        );
      }
    }
  
  
    function showGlobalError(message) {
  
      let element =
        $("#valuesError");
  
  
      if (!element) {
  
        element =
          document.createElement(
            "div"
          );
  
        element.id =
          "valuesError";
  
        element.className =
          "values-error-message";
  
  
        const app =
          $(".values-app");
  
  
        app?.prepend(
          element
        );
      }
  
  
      if (!element) {
        return;
      }
  
  
      element.textContent =
        message;
  
      element.classList.add(
        "show"
      );
    }
  
  
    function showSortError(message) {
  
      if (!elements.sortError) {
  
        showGlobalError(message);
  
        return;
      }
  
  
      elements.sortError.textContent =
        message;
  
      elements.sortError.classList.add(
        "show"
      );
    }
  
  
    function showCoreError(message) {
  
      if (!elements.coreError) {
  
        showGlobalError(message);
  
        return;
      }
  
  
      elements.coreError.textContent =
        message;
  
      elements.coreError.classList.add(
        "show"
      );
    }
  
  
    /* =========================================================
       SAVING UI
    ========================================================= */
  
    function setSaving(isSaving) {
  
      state.saving =
        isSaving;
  
  
      document.body.classList.toggle(
        "values-saving",
        isSaving
      );
  
  
      updateSelectionUI();
  
      updateCoreButton();
  
  
      if (
        elements.nextSorting
      ) {
  
        elements.nextSorting.disabled =
          isSaving;
      }
    }
  
  
    function setButtonsDisabled(
      disabled
    ) {
  
      $(
        "#nextSelection, " +
        "#nextSorting, " +
        "#completeValues"
      );
  
      [
        elements.nextSelection,
        elements.nextSorting,
        elements.completeButton
      ].forEach(
        button => {
  
          if (button) {
  
            button.disabled =
              disabled;
          }
        }
      );
    }
  
  
    /* =========================================================
       RESTART
    ========================================================= */
  
    async function handleRestart() {
  
      const confirmed =
        window.confirm(
          "Start the values exercise again? Your current values exercise will be reset."
        );
  
  
      if (!confirmed) {
        return;
      }
  
  
      setSaving(true);
  
      clearErrors();
  
  
      try {
  
        const response =
          await fetch(
            `${API_BASE}/reset`,
            {
              method: "PUT",
  
              credentials: "include",
  
              headers: {
                Accept:
                  "application/json",

                "X-CSRF-Token":
                  window.CSRF_TOKEN
              }
            }
          );
  
  
        const data =
          await parseJsonResponse(
            response
          );
  
  
        if (
          !response.ok ||
          !data.success
        ) {
  
          throw new Error(
            data?.error ||
            "Unable to reset your values."
          );
        }
  
  
        state.selectedValues = [];
  
        state.categories = {
          category1: [],
          category2: [],
          category3: []
        };
  
        state.unassignedValues = [];
  
        state.coreValues = {
          category1: null,
          category2: null,
          category3: null
        };
  
        state.completed = false;
  
        state.completedAt = null;
  
  
        updateSelectionUI();
  
        renderSortingBoard();
  
        renderCoreValueChoices();
  
        updateCoreButton();
  
        showStep(1);
  
      } catch (error) {
  
        console.error(
          "Reset values error:",
          error
        );
  
        showGlobalError(
          error.message ||
          "We couldn't reset your values. Please try again."
        );
  
      } finally {
  
        setSaving(false);
      }
    }
  
  
    /* =========================================================
       PUBLIC API
    ========================================================= */
  
    window.ValuesActivity = {
  
      getState() {
  
        return {
  
          selectedValues: [
            ...state.selectedValues
          ],
  
          categories: {
            category1: [
              ...state.categories.category1
            ],
  
            category2: [
              ...state.categories.category2
            ],
  
            category3: [
              ...state.categories.category3
            ]
          },
  
          coreValues: {
            ...state.coreValues
          },
  
          completed:
            state.completed,
  
          completedAt:
            state.completedAt
        };
      },
  
  
      reload: async function () {
  
        await loadSavedValues();
  
        reconcileState();
  
        restoreSavedState();
  
  
        if (state.completed) {
  
          showStep(4);
  
        } else {
  
          showStep(
            state.currentStep
          );
        }
      }
    };
  
  
    /* =========================================================
       START
    ========================================================= */
  
    initialize();
  
  });