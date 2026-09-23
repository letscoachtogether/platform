const PortalUser = require("../models/portaluser");
const { wrapControllerExports } = require("../middleware/asyncHandler");


/* =========================================================
   AVAILABLE VALUES
========================================================= */

const values = [
      'Accountability',
      'Achievement',
      'Adaptability',
      'Adventure',
      'Altruism',
      'Ambition',
      'Authenticity',
      'Balance',
      'Beauty',
      'Belonging',
      'Career',
      'Caring',
      'Collaboration',
      'Commitment',
      'Community',
      'Compassion',
      'Competence',
      'Confidence',
      'Connection',
      'Contentment',
      'Contribution',
      'Cooperation',
      'Courage',
      'Creativity',
      'Curiosity',
      'Dignity',
      'Diversity',
      'Environment',
      'Efficiency',
      'Equality',
      'Ethics',
      'Excellence',
      'Fairness',
      'Faith',
      'Family',
      'Financial stability',
      'Forgiveness',
      'Freedom',
      'Friendship',
      'Fun',
      'Future generations',
      'Generosity',
      'Giving back',
      'Grace',
      'Gratitude',
      'Growth',
      'Harmony',
      'Health',
      'Home',
      'Honesty',
      'Hope',
      'Humility',
      'Humor',
      'Inclusion',
      'Independence',
      'Initiative',
      'Integrity',
      'Intuition',
      'Job security',
      'Joy',
      'Justice',
      'Kindness',
      'Knowledge',
      'Leadership',
      'Learning',
      'Legacy',
      'Leisure',
      'Love',
      'Loyalty',
      'Making a difference',
      'Nature',
      'Openness',
      'Optimism',
      'Order',
      'Parenting',
      'Patience',
      'Patriotism',
      'Peace',
      'Perseverance',
      'Personal fulfillment',
      'Power',
      'Pride',
      'Recognition',
      'Reliability',
      'Resourcefulness',
      'Respect',
      'Responsibility',
      'Risk-taking',
      'Safety',
      'Security',
      'Self-discipline',
      'Self-expression',
      'Self-respect',
      'Serenity',
      'Service',
      'Simplicity',
      'Spirituality',
      'Sportsmanship',
      'Stewardship',
      'Success',
      'Teamwork',
      'Thrift',
      'Time',
      'Tradition',
      'Travel',
      'Trust',
      'Truth',
      'Understanding',
      'Uniqueness',
      'Usefulness',
      'Vision',
      'Vulnerability',
      'Wealth',
      'Well-being',
      'Wholeheartedness',
      'Wisdom'
    ];

const VALID_VALUES =
  new Set(values);


const CATEGORY_NAMES = [
  "category1",
  "category2",
  "category3"
];


/* =========================================================
   HELPERS
========================================================= */

function getPortalUserId(req) {

  return req.session?.portalUserId || null;
}


function cleanValues(input) {

  if (!Array.isArray(input)) {
    return [];
  }

  return [
    ...new Set(
      input
        .filter(
          value =>
            typeof value === "string"
        )
        .map(
          value =>
            value.trim()
        )
        .filter(
          value =>
            value &&
            VALID_VALUES.has(value)
        )
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

  if (
    !cleaned ||
    !VALID_VALUES.has(cleaned)
  ) {

    return null;
  }

  return cleaned;
}


function getEmptyCategories() {

  return {
    category1: [],
    category2: [],
    category3: []
  };
}


function getEmptyCoreValues() {

  return {
    category1: null,
    category2: null,
    category3: null
  };
}


function normalizeExercise(user) {

  if (!user.valuesExercise) {

    user.valuesExercise = {
      selectedValues: [],
      categories:
        getEmptyCategories(),
      coreValues:
        getEmptyCoreValues(),
      completed: false,
      completedAt: null,
      updatedAt: new Date()
    };
  }

  return user.valuesExercise;
}


function categoryObjectFrom(input) {

  const source =
    input || {};

  return {
    category1:
      cleanValues(
        source.category1
      ),

    category2:
      cleanValues(
        source.category2
      ),

    category3:
      cleanValues(
        source.category3
      )
  };
}


/*
 * Make sure categories form an exact partition
 * of selectedValues.
 */
function validateCategories(
  selectedValues,
  categories
) {

  const selectedSet =
    new Set(selectedValues);

  const allSorted = [
    ...categories.category1,
    ...categories.category2,
    ...categories.category3
  ];


  if (
    allSorted.length !==
    selectedValues.length
  ) {

    return {
      valid: false,
      message:
        "Every selected value must be assigned to a category."
    };
  }


  const sortedSet =
    new Set(allSorted);


  if (
    sortedSet.size !==
    allSorted.length
  ) {

    return {
      valid: false,
      message:
        "Each value can only appear in one category."
    };
  }


  if (
    sortedSet.size !==
    selectedSet.size
  ) {

    return {
      valid: false,
      message:
        "Every selected value must be assigned to a category."
    };
  }


  for (
    const value of allSorted
  ) {

    if (
      !selectedSet.has(value)
    ) {

      return {
        valid: false,
        message:
          "Categories may only contain values selected by the user."
      };
    }
  }


  return {
    valid: true
  };
}


/* =========================================================
   RENDER PAGES
========================================================= */

exports.getAllValues = async (
  req,
  res
) => {

  return res.render(
    "client-dashboard/all-values",
    {
      values
    }
  );
};


exports.getClientValues = async (
  req,
  res
) => {

  const portalUserId = getPortalUserId(req);

  const user = await PortalUser.findById(portalUserId);

  return res.render(
    "client-dashboard/client-values",
    {
      valuesExercise: user?.valuesExercise || null
    }
  );
};


/* =========================================================
   GET SAVED EXERCISE
========================================================= */

exports.getClientValuesExercise =
  async (req, res) => {

    try {

      const portalUserId =
        getPortalUserId(req);


      if (!portalUserId) {

        return res.status(401).json({
          error:
            "You must be signed in."
        });
      }


      const user =
        await PortalUser
          .findById(portalUserId)
          .select("valuesExercise");


      if (!user) {

        return res.status(404).json({
          error:
            "User not found."
        });
      }


      const exercise =
        normalizeExercise(user);


      return res.json({
        success: true,
        valuesExercise:
          exercise
      });

    } catch (error) {

      console.error(
        "Get values exercise error:",
        error
      );


      return res.status(500).json({
        error:
          "Unable to load your values exercise."
      });
    }
  };


/* =========================================================
   SAVE SELECTION
========================================================= */

exports.saveSelectedValues =
  async (req, res) => {

    try {

      const portalUserId =
        getPortalUserId(req);


      if (!portalUserId) {

        return res.status(401).json({
          error:
            "You must be signed in."
        });
      }


      const selectedValues =
        cleanValues(
          req.body?.selectedValues
        );


      const user =
        await PortalUser.findById(
          portalUserId
        );


      if (!user) {

        return res.status(404).json({
          error:
            "User not found."
        });
      }


      const exercise =
        normalizeExercise(user);


      const selectedSet =
        new Set(selectedValues);


      /*
       * Remove categories that are no longer
       * selected.
       */

      const categories =
        categoryObjectFrom(
          exercise.categories
        );


      CATEGORY_NAMES.forEach(
        category => {

          categories[category] =
            categories[category]
              .filter(
                value =>
                  selectedSet.has(value)
              );
        }
      );


      /*
       * Remove duplicates across categories.
       */

      const seen =
        new Set();


      CATEGORY_NAMES.forEach(
        category => {

          categories[category] =
            categories[category]
              .filter(value => {

                if (
                  seen.has(value)
                ) {

                  return false;
                }

                seen.add(value);

                return true;
              });
        }
      );


      /*
       * Core values that no longer belong
       * to their category must be cleared.
       */

      const coreValues = {
        category1:
          cleanSingleValue(
            exercise.coreValues?.category1
          ),

        category2:
          cleanSingleValue(
            exercise.coreValues?.category2
          ),

        category3:
          cleanSingleValue(
            exercise.coreValues?.category3
          )
      };


      CATEGORY_NAMES.forEach(
        category => {

          if (
            !categories[category]
              .includes(
                coreValues[category]
              )
          ) {

            coreValues[category] =
              null;
          }
        }
      );


      exercise.selectedValues =
        selectedValues;

      exercise.categories =
        categories;

      exercise.coreValues =
        coreValues;

      exercise.completed =
        false;

      exercise.completedAt =
        null;

      exercise.updatedAt =
        new Date();


      await user.save();


      return res.json({
        success: true,
        valuesExercise:
          exercise
      });

    } catch (error) {

      console.error(
        "Save selected values error:",
        error
      );


      return res.status(500).json({
        error:
          "Unable to save your selected values."
      });
    }
  };


/* =========================================================
   SAVE SORTING
========================================================= */

exports.saveSortedValues =
  async (req, res) => {

    try {

      const portalUserId =
        getPortalUserId(req);


      if (!portalUserId) {

        return res.status(401).json({
          error:
            "You must be signed in."
        });
      }


      const user =
        await PortalUser.findById(
          portalUserId
        );


      if (!user) {

        return res.status(404).json({
          error:
            "User not found."
        });
      }


      const exercise =
        normalizeExercise(user);


      const selectedValues =
        cleanValues(
          exercise.selectedValues
        );


      const categories =
        categoryObjectFrom(
          req.body?.categories
        );


      const validation =
        validateCategories(
          selectedValues,
          categories
        );


      if (!validation.valid) {

        return res.status(400).json({
          error:
            validation.message
        });
      }


      /*
       * Saving new categories invalidates core
       * selections if they no longer belong.
       */

      const coreValues = {
        category1:
          cleanSingleValue(
            exercise.coreValues?.category1
          ),

        category2:
          cleanSingleValue(
            exercise.coreValues?.category2
          ),

        category3:
          cleanSingleValue(
            exercise.coreValues?.category3
          )
      };


      CATEGORY_NAMES.forEach(
        category => {

          if (
            !categories[category]
              .includes(
                coreValues[category]
              )
          ) {

            coreValues[category] =
              null;
          }
        }
      );


      const coreComplete =
        CATEGORY_NAMES.every(
          category =>
            Boolean(
              coreValues[category]
            )
        );


      exercise.categories =
        categories;

      exercise.coreValues =
        coreValues;

      exercise.completed =
        coreComplete;

      exercise.completedAt =
        coreComplete
          ? exercise.completedAt || new Date()
          : null;

      exercise.updatedAt =
        new Date();


      await user.save();


      return res.json({
        success: true,
        valuesExercise:
          exercise
      });

    } catch (error) {

      console.error(
        "Save sorted values error:",
        error
      );


      return res.status(500).json({
        error:
          "Unable to save your categories."
      });
    }
  };


/* =========================================================
   SAVE CORE VALUES
========================================================= */

exports.saveCoreValues =
  async (req, res) => {

    try {

      const portalUserId =
        getPortalUserId(req);


      if (!portalUserId) {

        return res.status(401).json({
          error:
            "You must be signed in."
        });
      }


      const user =
        await PortalUser.findById(
          portalUserId
        );


      if (!user) {

        return res.status(404).json({
          error:
            "User not found."
        });
      }


      const exercise =
        normalizeExercise(user);


      const categories =
        categoryObjectFrom(
          exercise.categories
        );


      const coreValues = {
        category1:
          cleanSingleValue(
            req.body?.coreValues?.category1
          ),

        category2:
          cleanSingleValue(
            req.body?.coreValues?.category2
          ),

        category3:
          cleanSingleValue(
            req.body?.coreValues?.category3
          )
      };


      /*
       * Every category must have a core value.
       */

      for (
        const category of CATEGORY_NAMES
      ) {

        if (
          !coreValues[category]
        ) {

          return res.status(400).json({
            error:
              "Please choose one core value from each category."
          });
        }


        /*
         * Core value must actually belong
         * to its category.
         */

        if (
          !categories[category]
            .includes(
              coreValues[category]
            )
        ) {

          return res.status(400).json({
            error:
              "A core value must belong to its corresponding category."
          });
        }
      }


      /*
       * Core values can technically be the same
       * value only if it somehow exists in multiple
       * categories. Because categories are validated
       * as a partition, this normally cannot happen.
       */

      exercise.coreValues =
        coreValues;

      exercise.completed =
        true;

      exercise.completedAt =
        new Date();

      exercise.updatedAt =
        new Date();


      await user.save();


      return res.json({
        success: true,
        valuesExercise:
          exercise
      });

    } catch (error) {

      console.error(
        "Save core values error:",
        error
      );


      return res.status(500).json({
        error:
          "Unable to save your core values."
      });
    }
  };


/* =========================================================
   RESET EXERCISE
========================================================= */

exports.resetValuesExercise =
  async (req, res) => {

    try {

      const portalUserId =
        getPortalUserId(req);


      if (!portalUserId) {

        return res.status(401).json({
          error:
            "You must be signed in."
        });
      }


      const user =
        await PortalUser.findById(
          portalUserId
        );


      if (!user) {

        return res.status(404).json({
          error:
            "User not found."
        });
      }


      const exercise =
        normalizeExercise(user);


      exercise.selectedValues = [];

      exercise.categories =
        getEmptyCategories();

      exercise.coreValues =
        getEmptyCoreValues();

      exercise.completed =
        false;

      exercise.completedAt =
        null;

      exercise.updatedAt =
        new Date();


      await user.save();


      return res.json({
        success: true,
        valuesExercise:
          exercise
      });

    } catch (error) {

      console.error(
        "Reset values exercise error:",
        error
      );


      return res.status(500).json({
        error:
          "Unable to reset your values exercise."
      });
    }
  };

wrapControllerExports(exports);