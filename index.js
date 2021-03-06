(function (dataMotherBuilder) {
    if (typeof require === 'function') {
        const signet = require('signet')();
        const matchlight = require('matchlight')(signet);

        module.exports = dataMotherBuilder(signet, matchlight);
    } else {
        if (typeof matchlightFactory === 'undefined' || typeof signet === 'undefined') {
            throw new Error('DataMother requires signet and Matchlight to work properly.');
        }

        const matchlight = matchlightFactory(signet);

        window.dataMother = dataMotherBuilder(signet, matchlight)();
    }

})(function dataMotherBuilder(signet, matchlight) {
    'use strict';

    const match = matchlight.match;

    const optionsDefinition = {
        dataOptions: '?composite<^null, ^array, object>'
    };


    const isOptionsObject = signet.duckTypeFactory(optionsDefinition);
    const isObjectInstace = signet.isTypeOf('composite<not<null>, object>');
    const isArray = signet.isTypeOf('array');
    const isFunction = signet.isTypeOf('function');
    const isDefined = signet.isTypeOf('not<undefined>');

    const isNotFunction = (value) => !isFunction(value);
    const set = (data, key, value) => { data[key] = value; return data; };


    function helpersFactory(motherFactories) {

        const throwError = (errorMessage) => { throw new Error(errorMessage); };

        function getFactoryOrThrow(name) {
            const errorMessage = `Unable to find mother factory, '${name}'`;

            return match(motherFactories[name], (matchCase, matchDefault) => {
                matchCase(isNotFunction, () => throwError(errorMessage));
                matchDefault((motherFactory) => motherFactory);
            });
        }

        function throwOnBadOptionsObject(options) {
            if (isDefined(options) && !isOptionsObject(options)) {
                const optionsDefinitionString = JSON.stringify(optionsDefinition, null, 4);
                const errorMessage = `Invalid options object. Expected value like ${optionsDefinitionString}`;

                throwError(errorMessage);
            }
        }

        return {
            getFactoryOrThrow: getFactoryOrThrow,
            throwOnBadOptionsObject: throwOnBadOptionsObject
        };

    }

    function dataBuilderApiFactory(name, options, buildData, helpers, match) {
        const { getFactoryOrThrow, throwOnBadOptionsObject } = helpers;

        throwOnBadOptionsObject(options);

        function getOptionsData() {
            return typeof options === 'object'
                ? options.optionsData
                : (undefined);
        }

        const constructAndAttachProperty = (index) => (data, key) => {
            const optionsData = getOptionsData();

            const property = match(data[key], (matchCase, matchDefault) => {
                matchCase(isFunction,
                    (dataFactory) => dataFactory(index, optionsData));
                matchDefault((value) => value);
            });

            return set(data, key, property);
        };


        function constructFactoryProps(dataOutput, index) {
            return Object
                .keys(dataOutput)
                .reduce(constructAndAttachProperty(index), dataOutput);
        }

        function constructProperties(dataOutput, index = 0) {
            return match(dataOutput, (matchCase, matchDefault) => {
                matchCase(isObjectInstace,
                    (dataOutput) => constructFactoryProps(dataOutput, index));
                matchDefault((dataOutput) => dataOutput);
            });
        }

        function buildDataObjectArray(length) {
            const dataArray = [buildDataObject()];

            return match(length, (matchCase, matchDefault) => {
                matchCase(1, () => dataArray);
                matchDefault(() => dataArray.concat(buildDataObjectArray(length - 1)));
            });
        }

        function buildDataObject() {
            const motherFactory = getFactoryOrThrow(name);
            const dependencyData = motherFactory['@dependencies']
                .map((value) => buildData(value, options));

            return motherFactory.apply(null, dependencyData);
        }

        return {
            buildDataObject: buildDataObject,
            buildDataObjectArray: buildDataObjectArray,
            constructProperties: constructProperties
        };
    }

    return function dataMother() {

        let motherFactories = {};
        const helpers = helpersFactory(motherFactories, buildData);

        function buildDataBuilderApi(name, options) {
            return dataBuilderApiFactory(name, options, buildData, helpers, match)
        }

        function buildDataArray(name, length = 1, options) {
            const dataBuilderApi = buildDataBuilderApi(name, options);
            const { constructProperties, buildDataObjectArray } = dataBuilderApi;

            return buildDataObjectArray(length).map(constructProperties);
        }

        function buildData(name, options) {
            const dataBuilderApi = buildDataBuilderApi(name, options);
            const { constructProperties, buildDataObject } = dataBuilderApi;

            return constructProperties(buildDataObject(), 0);
        }

        function register(name, factory) {
            const dependencies =
                match(factory['@dependencies'], (matchCase, matchDefault) => {
                    matchCase(isArray, (dependencies) => dependencies);
                    matchDefault(() => []);
                });

            motherFactories[name] = set(factory, '@dependencies', dependencies);
        }

        return {
            buildData: signet.enforce(
                'name:string, options:[object] => *',
                buildData),
            buildDataArray: signet.enforce(
                'name:string, length:variant<undefined, leftBoundedInt<1>>, options:[object] => array<*>',
                buildDataArray),
            register: signet.enforce(
                'name:string, factory:function => undefined',
                register)
        };

    }

});
