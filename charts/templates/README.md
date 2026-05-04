# Templates

A collection of Helm charts that can be deployed through AnvilOps to add additional functionality to apps,
if Helm deployments are enabled.

AnvilOps will retrieve templates from `oci://$REGISTRY_HOSTNAME/$CHART_PROJECT_NAME`,
where `$REGISTRY_HOSTNAME` and `$CHART_PROJECT_NAME` are environment variables on the backend.
The registry should be a Harbor registry.

Available templates can be listed at `/api/templates/charts`.

## Creating a Template

To create a template from an existing Helm chart, add several AnvilOps-specific keys to the annotations of the `Chart.yaml`.
These annotations determine how the frontend will render the chart's configurable values and other information.

### `anvilops-values`

This annotation is used to generate input fields for the app creation and configuration forms.
The value of this annotation should be a JSON object that follows the JSON schema defined in `anvilops-values-schema.json`.
See more about this schema [below](#Writing-the-anvilops-values).

### `anvilops-note`

A note describing the purpose of the chart that will be displayed on the frontend when the user is selecting a chart.

### `anvilops-watch-labels`

The AnvilOps dashboard can show the statuses of pods as well as stream their logs.
Set this annotation to a comma-separated list of key-value pairs representing labels to select the pods that AnvilOps should watch,
e.g. `application=spilo,spilo-role=master`. If this annotation is left undefined, then all pods will be selected.

## Writing the `anvilops-values`

This JSON object mirrors the structure of the `values.yaml` file, but wraps each key with additional metadata.

### Objects

An object is represented with the `branch` schema in [anvilops-values-schema.json](./anvilops-values-schema.json).
The keys of this object are represented under the `children` key, as more branches or leaves.  
The branch schema requires a key `_anvilopsRender` to match one of two objects:

1. `{ "type": "dropdown" }`. The AnvilOps frontend creates a new dropdown list and renders the child branches and leaves within it.
   In particular, the frontend creates an [Accordion](https://ui.shadcn.com/docs/components/radix/accordion) component. It will not
   actually create a clickable dropdown label. For that, set `{ "type": "section" }` in one of its child branches.

2. `{ "type": "section", "displayName": "<section_title>" }`. The frontend creates a dropdown list item, labeled with the
   `<section_title>` of your choice. In particular, AnvilOps will create an [AccordionItem](https://ui.shadcn.com/docs/components/radix/accordion)
   and render the children inside the AccordionContent.

### Values

An individual value is represented with the `leaf` schema, which AnvilOps will use to render an input field.

**Required properties**:

`_anvilopsValue`: This must be set to `true`.

`displayName`: Some text to label the input field with.

`type`: The type of input. This should be either `"text"` or `"number"`.

`required`: Whether the input is required. `true` or `false`.

**Other useful properties**:

`default`: A default value. Can be any type.

`random`: When this is set to `true`, AnvilOps will autofill the form field with a random string or number.

`noUpdate`: Set this to `true` for values that cannot be updated after the first deployment, such as storage amounts.

`unit`: A string describing the unit of a numeric input, e.g. `"Gi"`.

`min, max`: Minimum and maximum values for numeric input.

`minLength, maxLength`: Minimum and maximum lengths for text input.

### Example

Suppose we have a `values.yaml` file like

```
favorites:
    drink: "water" # Required
    food: # Optional
    number: 25 # Required, between 1 and 100
hello: "world" # Required
```

Our `anvilops-values` could look like:

```json
{
  "_anvilopsRender": {
    "type": "dropdown"
  },
  "children": {
    "favorites": {
      "_anvilopsRender": {
        "type": "section",
        "displayName": "Favorites"
      },
      "children": {
        "drink": {
          "_anvilopsValue": true,
          "displayName": "Drink",
          "type": "text",
          "required": true,
          "default": "water"
        },
        "food": {
          "_anvilopsValue": true,
          "displayName": "Food",
          "type": "text",
          "required": false
        },
        "number": {
          "_anvilopsValue": true,
          "displayName": "Number",
          "type": "number",
          "required": true,
          "default": 25,
          "min": 1,
          "max": 100
        }
      }
    },
    "hello": {
      "_anvilopsValue": true,
      "displayName": "hello",
      "type": "text",
      "required": "true",
      "default": "world"
    }
  }
}
```

### Testing the `anvilops-values`

Ajv can be used to validate an `anvilops-values` object against the schema. See [validate-spec.sh](./validate-spec.sh).

## How AnvilOps installs templates

When installing the helm chart, AnvilOps flattens the values into paths separated by dots, which are passed to Helm
using `--set`, `--set-string`, and `--set-json` flags. For instance, the `drink` key in the above `values.yaml` would be set
with `--set-string "favorites.drink=water"`, and the `number` key would be set with `--set "favorites.number=25".

A value with `"type": "text"` is always set with `--set-string` to avoid coercing strings like "1" or "true" to another type.
Numbers are set with `--set`. An empty value is set with `--set-json` to `null`, e.g. `--set-json "favorites.food=null"`.
