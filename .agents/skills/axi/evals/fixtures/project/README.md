# AXI review evaluation workspace

This directory is the shared working directory for both evaluation providers.
All case facts are supplied in the test request. There is no executable target
CLI, credential configuration, or live service connection here.

The evaluation-local plugin is loaded only for the with-skill provider. The
baseline does not discover project, local, or user settings. Neither provider
is granted shell, write, or network tools.
