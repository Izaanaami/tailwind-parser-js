import resolveConfig from "tailwindcss/resolveConfig";
import type { Config } from "tailwindcss/types/config";
import flattenColorPalette from "tailwindcss/lib/util/flattenColorPalette";
import { properties, namedClassProperties } from "./properties";
import { decodeArbitraryValue } from "./utils/decode-arbitrary-value";
import { inferDataType } from "./utils/infer-data-type";
const config = require("../tests/tailwind.config");

const Tailwind = (config?: Config) => {
  // @ts-ignore resolveConfig doesn't like empty config but stubs it anyways
  const resolvedConfig = resolveConfig(config || {});
  const theme = resolvedConfig.theme || {};

  // add negative values to scales
  Object.keys(properties).forEach((property) => {
    const { scale, supportsNegativeValues } = properties[property];
    if (
      supportsNegativeValues &&
      theme[scale] &&
      !theme[scale].negativeValuesAdded
    ) {
      Object.keys(theme[scale]).forEach((key) => {
        theme[scale]["-" + key] = "-" + theme[scale][key];
      });
      theme[scale].negativeValuesAdded = true;
    }
  });

  // TODO: check source code for this because the types are more flexible than object
  const responsiveModifiers = Object.keys(theme.screens || {});
  const pseudoModifiers = resolvedConfig.variantOrder;

  const parse = (className: string = "") => {
    if (className.startsWith(".")) className = className.replace(".", "");

    // format: prefix-value | responsive:prefix-value | pseudo:prefix-value | responsive:pseudo:prefix-value
    let responsiveModifier: string | null = null;
    let pseudoModifier: string | null = null;
    let propertyName: string;
    let propertyValue: string | null;
    let relatedProperties: { [key: string]: string } = {};

    let classNameWithoutModifiers: string = "";

    let isImportant = false;
    if (className.startsWith("!") || className.endsWith("!")) {
      isImportant = true;
      className = className.replace("!", "");
    }

    // check the className for any arbitrary property or value before splitting the modifiers
    // because arbitrary properties include ':' and we need to strip them away before splitting modifiers using ':'
    let isArbitraryProperty = false;
    let isArbitraryValue = false;
    if (className.includes("[")) {
      let index = className.indexOf("[") - 1;
      if (index === -1 || className.charAt(index) !== "-") {
        isArbitraryProperty = true;
      } else {
        isArbitraryValue = true;
      }
    }
    // strip away the arbitrary value or property if there is any
    let arbitraryValue: string;
    let arbitraryProperty: string;
    if (isArbitraryProperty || isArbitraryValue) {
      const startIndex = className.indexOf("[");
      const endIndex = className.indexOf("]");
      let arbitraryPart = className.slice(startIndex, endIndex + 1);
      if (isArbitraryProperty) arbitraryProperty = arbitraryPart;
      else arbitraryValue = arbitraryPart.slice(1, -1);
    }

    let numberOfModifiers: number;
    if (isArbitraryProperty) {
      let classNameWithoutArbitraryProperty = className.replace(
        arbitraryProperty,
        ""
      );
      numberOfModifiers = classNameWithoutArbitraryProperty.split(":").length;
    } else {
      numberOfModifiers = className.split(":").length - 1;
    }

    if (numberOfModifiers === 0 && !isArbitraryProperty)
      classNameWithoutModifiers = className;
    else if (numberOfModifiers === 0 && isArbitraryProperty)
      classNameWithoutModifiers = arbitraryProperty;
    else if (numberOfModifiers === 1) {
      const unknownModifier = className.split(":")[0];
      if (isArbitraryProperty) classNameWithoutModifiers = arbitraryProperty;
      else classNameWithoutModifiers = className.split(":")[1];
      if (responsiveModifiers.includes(unknownModifier))
        responsiveModifier = unknownModifier;
      else if (pseudoModifiers.includes(unknownModifier))
        pseudoModifier = unknownModifier;
      else; // have no idea what this is, TODO: should this ignore or throw an error?
    } else if (numberOfModifiers === 2) {
      responsiveModifier = className.split(":")[0];
      pseudoModifier = className.split(":")[1];
      if (isArbitraryProperty) classNameWithoutModifiers = arbitraryProperty;
      else classNameWithoutModifiers = className.split(":")[2];
    }

    let isNegative = false;
    if (classNameWithoutModifiers.startsWith("-")) {
      isNegative = true;
      classNameWithoutModifiers = classNameWithoutModifiers.replace("-", "");
    }

    // check arbitrary properties
    else if (isArbitraryProperty) {
      const arbitraryPropertyWithoutBrackets =
        classNameWithoutModifiers.replace("[", "") +
        classNameWithoutModifiers.replace("]", "");
      propertyValue = arbitraryPropertyWithoutBrackets.split(":")[1];
      return "hello there";
    }
    // check named classes
    else if (namedClassProperties[classNameWithoutModifiers]) {
      const styles = namedClassProperties[classNameWithoutModifiers];
      if (Object.keys(styles).length > 1) {
        propertyName = "composite";
        propertyValue = null;
        relatedProperties = styles;
      } else {
        propertyName = Object.keys(styles)[0];
        propertyValue = styles[propertyName];
      }
    } else {
      const possiblePropertyNames = Object.keys(properties).filter((name) => {
        const property = properties[name];
        if (classNameWithoutModifiers === property.prefix) return true; // flex-grow-DEFAULT = flex-grow
        if (classNameWithoutModifiers.startsWith(property.prefix + "-"))
          return true;
        return false;
      });

      if (possiblePropertyNames.length === 0) {
        // no clue what this is then
        // TODO: improve error for unhandled properties
        propertyName = "ERROR";
        propertyValue = "ERROR";
      } else {
        // check properties with an arbitrary value
        if (isArbitraryValue) {
          console.log(arbitraryValue);
          console.log(possiblePropertyNames);
          // convert underlines to whitespace ( if value is not a url )
          const decodedArbitraryValue = decodeArbitraryValue(arbitraryValue);
          if (possiblePropertyNames.length > 1) {
            const dataType = inferDataType(decodedArbitraryValue, [
              "color",
              "number",
              "percentage",
              "url",
              "length",
              "position",
              "absolute-size",
              "vector",
              "angle",
              "relative-size",
              "generic-name",
              "family-name",
              "image",
              "bg-size",
              "line-width",
            ]);
            // box-shadow is special and is handled separately
            if (
              possiblePropertyNames.includes("box-shadow") &&
              dataType !== "color"
            )
              propertyName = "box-shadow";
            // find the propertyName
            else {
              propertyName = possiblePropertyNames
                .sort(
                  (a, b) =>
                    properties[b].prefix.length - properties[a].prefix.length
                )
                .find((prop) =>
                  properties[prop].acceptedValueTypes.includes(dataType)
                );
              if (propertyName === undefined) propertyName = "ERROR";
            }
          } else propertyName = possiblePropertyNames[0];
          propertyValue = arbitraryValue;
        } else {
          // match value to find property
          const matchingPropertyName = possiblePropertyNames
            .sort(
              (a, b) =>
                properties[b].prefix.length - properties[a].prefix.length
            )
            .find((name) => {
              const property = properties[name];

              // flatten color scales
              const scale =
                property.scale.includes("color") ||
                property.scale.includes("Color")
                  ? flattenColorPalette(theme[property.scale])
                  : theme[property.scale];
              if (!scale) return false; // couldn't find scale for property, probably unhandled

              const scaleKey =
                property.scale === "colors"
                  ? // remove opacity modifier
                    classNameWithoutModifiers
                      .split("/")[0]
                      .replace(property.prefix + "-", "")
                  : classNameWithoutModifiers.replace(
                      property.prefix + "-",
                      ""
                    );

              if (scale.DEFAULT) scale[property.prefix] = scale.DEFAULT;

              const possibleValue = scale[scaleKey];
              // this could be null if it's not the right property
              return Boolean(possibleValue);
            });

          if (matchingPropertyName) {
            propertyName = matchingPropertyName;
            const property = properties[matchingPropertyName];

            const scale =
              property.scale.includes("color") ||
              property.scale.includes("Color")
                ? flattenColorPalette(theme[property.scale])
                : theme[property.scale];
            const scaleKey =
              property.scale === "colors"
                ? // remove opacity modifier
                  classNameWithoutModifiers
                    .split("/")[0]
                    .replace(property.prefix + "-", "")
                : classNameWithoutModifiers.replace(property.prefix + "-", "");
            const possibleValue = scale[scaleKey];

            // fontSize is special
            if (propertyName === "font-size" && Array.isArray(possibleValue)) {
              propertyValue = possibleValue[0];
              relatedProperties = possibleValue[1];
            } else if (property.scale === "colors") {
              const opacity = parseInt(classNameWithoutModifiers.split("/")[1]);
              propertyValue =
                possibleValue + (opacity ? percentToHex(opacity) : "");
            } else if (Array.isArray(possibleValue)) {
              // true for fontFamily and dropShadow
              propertyValue = possibleValue.join(", ");
            } else {
              propertyValue = possibleValue;
            }
          } else {
            // no clue what this is then
            propertyName = "ERROR";
            propertyValue = "ERROR";
          }
        }
      }
    }

    return {
      className,
      responsiveModifier,
      pseudoModifier,
      property: propertyName,
      value: isNegative ? "-" + propertyValue : propertyValue,
      relatedProperties,
      isImportant,
    };
  };

  const classname = ({
    responsiveModifier,
    pseudoModifier,
    property: propertyName,
    value: propertyValue,
  }: {
    responsiveModifier?: string;
    pseudoModifier?: string;
    property: string;
    value: string;
  }) => {
    let className: string | undefined = "";
    let error: {
      responsiveModifier?: string;
      pseudoModifier?: string;
      property?: string;
      value?: string;
    } = {};

    if (responsiveModifier) {
      if (responsiveModifiers.includes(responsiveModifier))
        className = responsiveModifier + ":";
      else
        error[
          "responsiveModifier"
        ] = `Unidentified responsive modifier, expected one of [${responsiveModifiers.join(
          ", "
        )}], got ${responsiveModifier}`;
    }

    if (pseudoModifier) {
      if (pseudoModifiers.includes(pseudoModifier))
        className = className + pseudoModifier + ":";
      else
        error[
          "pseudoModifier"
        ] = `Unidentified pseudo modifier, expected one of [${pseudoModifiers.join(
          ", "
        )}], got ${pseudoModifier}`;
    }

    const matchingProperty = properties[propertyName];

    if (matchingProperty) {
      // flatten color scales
      const scale =
        matchingProperty.scale.includes("color") ||
        matchingProperty.scale.includes("Color")
          ? flattenColorPalette(theme[matchingProperty.scale])
          : theme[matchingProperty.scale];

      // find value on scale
      if (scale) {
        let scaleKey;

        if (propertyName === "font-size") {
          // format: sm: [ '0.875rem', { lineHeight: '1.25rem' } ],
          scaleKey = Object.keys(scale).find(
            (key) => scale[key][0] === propertyValue
          );
        } else if (matchingProperty.scale === "colors") {
          if (!propertyValue.startsWith("#")) {
            error["value"] =
              "Only hex values are supported, example: #fecaca80";
          } else if (![7, 9].includes(propertyValue.length)) {
            error["value"] =
              "Shorthand hex values like #0008 are not supported, please pass the full value like #00000080";
          }

          let opacity: number | null = null;

          // example: #fecaca80
          if (propertyValue.length === 9) {
            opacity = hexToPercent(propertyValue.slice(-2));
            propertyValue = propertyValue.slice(0, -2);
          }

          // convert to lowercase for comparison
          propertyValue = propertyValue.toLowerCase();

          scaleKey = Object.keys(scale).find((key) => {
            return scale[key] === propertyValue;
          });

          if (scaleKey && opacity) scaleKey = scaleKey + "/" + opacity;
        } else {
          scaleKey = Object.keys(scale).find((key) => {
            // true for dropShadow and fontFamily
            if (Array.isArray(scale[key]))
              return scale[key].join(", ") === propertyValue;
            else return scale[key] === propertyValue;
          });
        }

        // move - for negative value to prefix
        const isNegative = scaleKey?.startsWith("-");

        if (isNegative) {
          className += "-";
          scaleKey = scaleKey.replace("-", "");
        }

        className += matchingProperty.prefix;

        if (scaleKey === "DEFAULT") {
          /* we don't add default */
        } else if (scaleKey) className += "-" + scaleKey;
        else if (!error.value) error["value"] = "UNIDENTIFIED_VALUE";
      } else {
        error["property"] = "UNIDENTIFIED_PROPERTY";
      }
    } else {
      const namedClassPropertyIndex = Object.values(
        namedClassProperties
      ).findIndex((styles) => {
        if (Object.keys(styles).length > 1) return false;

        const name = Object.keys(styles)[0];
        const value = styles[propertyName];
        return name === propertyName && value === propertyValue;
      });

      if (namedClassPropertyIndex !== -1) {
        className =
          className +
          Object.keys(namedClassProperties)[namedClassPropertyIndex];
      } else {
        error["property"] = "UNIDENTIFIED_PROPERTY";
      }
    }

    if (Object.keys(error).length > 0) return { error };
    else return { className };
  };

  return {
    parse,
    classname,
    meta: { responsiveModifiers, pseudoModifiers, resolvedConfig },
  };
};

export default Tailwind;

const percentToHex = (percent: number) => {
  const intValue = Math.round((percent / 100) * 255); // map percent to nearest integer (0 - 255)
  const hexValue = intValue.toString(16); // get hexadecimal representation
  return hexValue.padStart(2, "0"); // format with leading 0 and upper case characters
};

const hexToPercent = (hex: string) => {
  return Math.floor((100 * parseInt(hex, 16)) / 255);
};
