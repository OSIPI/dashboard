def test_package_imports_and_has_version():
    import osipy_rest_api

    assert osipy_rest_api.__version__ == "0.1.0"
