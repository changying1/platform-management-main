package com.app.myapplication.data.model;

/**
 * 围栏统计信息
 */
public class FenceStats {
    public Integer total;
    public Integer active;
    public ByShape by_shape;

    public static class ByShape {
        public Integer circle;
        public Integer polygon;
    }
}
