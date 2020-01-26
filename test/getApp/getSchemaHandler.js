const { expect } = require("chai");
const { createTree, destroyTree } = require("create-fs-tree");
const { tmpdir } = require("os");
const Ajv = require("ajv");
const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

const getSchemaHandler = require("getApp/getSchemaHandler");
const errorHandler = require("getApp/errorHandler");

describe("get schema handlers", () => {
    const root = `${tmpdir()}/mock-server/getApp/getSchemaHandler`;
    let ajv;
    let server;
    const originalHandler = (req, res) => {
        res.status(200).send({
            method: req.method,
            path: req.path,
            params: req.params,
            body: req.body,
            query: req.query
        });
    };
    const paramsSchema = {
        type: "object",
        properties: {
            param1: { type: "string" },
            param2: { type: "number" }
        }
    };
    const querySchema = {
        type: "object",
        properties: {
            foo: { type: "string" }
        },
        required: ["foo"]
    };
    const onlyReqBody = {
        type: "object",
        properties: {
            list: {
                type: "array",
                items: {
                    type: "number"
                }
            },
            testString: { type: "string" }
        },
        required: ["list"]
    };
    const onlyResponse = {
        type: "object",
        properties: {
            method: { type: "string" },
            path: { type: "string" },
            params: {
                type: "object",
                additionalProperties: true
            },
            body: {
                type: "object",
                additionalProperties: true
            },
            query: {
                type: "object",
                additionalProperties: true
            }
        },
        additionalProperties: false,
        required: ["query", "body", "params", "path", "method"]
    };

    beforeEach(() => {
        ajv = new Ajv({ coerceTypes: true });
        createTree(root, {
            "empty-schema.json": "{}",
            "only-params.json": JSON.stringify({ params: paramsSchema }),
            "only-query.json": JSON.stringify({ query: querySchema }),
            "only-req-body.json": JSON.stringify({ body: onlyReqBody }),
            "only-response.json": JSON.stringify({ response: onlyResponse }),
            "all.json": JSON.stringify({
                params: paramsSchema,
                query: querySchema,
                body: onlyReqBody,
                response: onlyResponse
            })
        });
        server = express().use(
            bodyParser.json({ limit: "1gb", strict: false })
        );
    });

    afterEach(() => {
        destroyTree(root);
    });

    it("if empty schema returns original handler", () => {
        const handler = getSchemaHandler(
            ajv,
            `${root}/empty-schema.json`,
            originalHandler
        );
        expect(handler).to.equal(originalHandler);
    });

    describe("with only params schema", () => {
        it("validate successfully", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/only-params.json`,
                originalHandler
            );
            return request(server.get("/my-api/:param1/:param2", handler))
                .get("/my-api/foo/3")
                .expect(200)
                .expect({
                    method: "GET",
                    path: "/my-api/foo/3",
                    params: {
                        param1: "foo",
                        param2: 3
                    },
                    query: {},
                    body: {}
                });
        });

        it("throws during validation", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/only-params.json`,
                originalHandler
            );
            return request(
                server.get("/my-api/:param1/:param2", handler).use(errorHandler)
            )
                .get("/my-api/foo/bar")
                .expect(400)
                .expect({
                    error: "Bad Request",
                    message: "params.param2 should be number"
                });
        });
    });

    describe("with only query schema", () => {
        it("validate successfully", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/only-params.json`,
                originalHandler
            );
            return request(server.get("/my-api", handler))
                .get("/my-api")
                .query({
                    foo: "bar"
                })
                .expect(200)
                .expect({
                    method: "GET",
                    path: "/my-api",
                    query: {
                        foo: "bar"
                    },
                    params: {},
                    body: {}
                });
        });

        it("throws during validation", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/only-query.json`,
                originalHandler
            );
            return request(server.get("/my-api", handler).use(errorHandler))
                .get("/my-api")
                .expect(400)
                .expect({
                    error: "Bad Request",
                    message: "query should have required property 'foo'"
                });
        });
    });

    describe("with only body schema", () => {
        it("validate successfully", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/only-req-body.json`,
                originalHandler
            );
            return request(server.post("/my-api", handler))
                .post("/my-api")
                .send({
                    list: [1, 2, 34],
                    testString: "my string"
                })
                .expect(200)
                .expect({
                    method: "POST",
                    path: "/my-api",
                    query: {},
                    params: {},
                    body: {
                        list: [1, 2, 34],
                        testString: "my string"
                    }
                });
        });

        it("throws during validation", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/only-req-body.json`,
                originalHandler
            );
            return request(server.post("/my-api", handler).use(errorHandler))
                .post("/my-api")
                .send({
                    list: [1, "foo"]
                })
                .expect(400)
                .expect({
                    error: "Bad Request",
                    message: "requestBody.list[1] should be number"
                });
        });
    });

    describe("with only response schema", () => {
        it("validate successfully", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/only-response.json`,
                originalHandler
            );
            return request(server.get("/my-api", handler))
                .get("/my-api")
                .expect(200)
                .expect({
                    method: "GET",
                    path: "/my-api",
                    query: {},
                    params: {},
                    body: {}
                });
        });

        it("throws during validation", () => {
            const originalErrorHandler = (req, res) => {
                res.status(200).send({
                    another: "body"
                });
            };
            const handler = getSchemaHandler(
                ajv,
                `${root}/only-response.json`,
                originalErrorHandler
            );
            return request(server.get("/my-api", handler).use(errorHandler))
                .get("/my-api")
                .expect(400)
                .expect({
                    error: "Bad Request",
                    message: "response should NOT have additional properties"
                });
        });
    });

    describe("with a complete schema", () => {
        it("validate successfully", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/all.json`,
                originalHandler
            );
            return request(server.post("/my-api/:param1/:param2", handler))
                .post("/my-api/param/34")
                .query({
                    foo: "bar"
                })
                .send({
                    list: [12, 23, 56]
                })
                .expect(200)
                .expect({
                    method: "POST",
                    path: "/my-api/param/34",
                    query: {
                        foo: "bar"
                    },
                    params: {
                        param1: "param",
                        param2: 34
                    },
                    body: {
                        list: [12, 23, 56]
                    }
                });
        });

        it("throws during validation", () => {
            const handler = getSchemaHandler(
                ajv,
                `${root}/all.json`,
                originalHandler
            );
            return request(
                server
                    .post("/my-api/:param1/:param2", handler)
                    .use(errorHandler)
            )
                .post("/my-api/param/34")
                .expect(400)
                .expect({
                    error: "Bad Request",
                    message: "query should have required property 'foo'"
                });
        });
    });
});
